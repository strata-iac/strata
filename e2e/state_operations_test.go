//go:build e2e

package e2e

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// TestPulumiStackExport runs `pulumi stack export` on a stack that has been deployed to.
func TestPulumiStackExport(t *testing.T) {
	truncateDB(t)
	env := newTestEnv(t, "export-project")
	env.login()

	fqn := devOrgLogin + "/export-project/dev"
	env.run("stack", "init", "--stack", fqn)
	env.run("up", "--yes", "--stack", fqn)

	stdout, _ := env.run("stack", "export", "--stack", fqn)

	var deployment map[string]json.RawMessage
	if err := json.Unmarshal([]byte(stdout), &deployment); err != nil {
		t.Fatalf("export output is not valid JSON: %v\noutput: %s", err, stdout)
	}

	if _, ok := deployment["version"]; !ok {
		t.Fatal("expected 'version' field in export output")
	}
	if _, ok := deployment["deployment"]; !ok {
		t.Fatal("expected 'deployment' field in export output")
	}
}

// TestPulumiStackExportImport runs export then import — the round-trip.
func TestPulumiStackExportImport(t *testing.T) {
	truncateDB(t)

	home := t.TempDir()
	projectDir := t.TempDir()
	pulumiYAML := `name: exportimport-project
runtime: yaml
description: E2E test export/import
outputs:
  greeting: "hello from export-import"
`
	if err := os.WriteFile(filepath.Join(projectDir, "Pulumi.yaml"), []byte(pulumiYAML), 0o644); err != nil {
		t.Fatalf("write Pulumi.yaml: %v", err)
	}

	env := &testEnv{
		t:           t,
		home:        home,
		projectDir:  projectDir,
		accessToken: devAuthToken,
	}
	env.login()

	fqn := devOrgLogin + "/exportimport-project/dev"
	env.run("stack", "init", "--stack", fqn)
	env.run("up", "--yes", "--stack", fqn)

	// Export the state.
	exportStdout, _ := env.run("stack", "export", "--stack", fqn)

	// Write export to a temp file for import.
	exportFile := filepath.Join(t.TempDir(), "state.json")
	if err := os.WriteFile(exportFile, []byte(exportStdout), 0o644); err != nil {
		t.Fatalf("write export file: %v", err)
	}

	// Import the state back.
	stdout, stderr := env.run("stack", "import", "--stack", fqn, "--file", exportFile)
	output := combinedOutput(stdout, stderr)
	t.Logf("import output: %s", output)

	// Verify the stack output is still correct after import.
	outStdout, _ := env.run("stack", "output", "--json", "--stack", fqn)
	if !strings.Contains(outStdout, "hello from export-import") {
		t.Fatalf("expected 'hello from export-import' in stack output after import, got: %s", outStdout)
	}

	// Verify a new import update was created in the DB.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var importCount int
	err := dbPool.QueryRow(ctx, `SELECT COUNT(*) FROM updates WHERE kind = 'import' AND status = 'succeeded'`).Scan(&importCount)
	if err != nil {
		t.Fatalf("query import updates: %v", err)
	}
	if importCount == 0 {
		t.Fatal("expected at least 1 import update record")
	}
}

// TestPulumiStackExportEmpty tests exporting an empty stack (no deployments yet).
func TestPulumiStackExportEmpty(t *testing.T) {
	truncateDB(t)
	env := newTestEnv(t, "export-empty-project")
	env.login()

	fqn := devOrgLogin + "/export-empty-project/dev"
	env.run("stack", "init", "--stack", fqn)

	stdout, _ := env.run("stack", "export", "--stack", fqn)

	var deployment map[string]json.RawMessage
	if err := json.Unmarshal([]byte(stdout), &deployment); err != nil {
		t.Fatalf("export output is not valid JSON: %v\noutput: %s", err, stdout)
	}

	if _, ok := deployment["version"]; !ok {
		t.Fatal("expected 'version' field in empty export output")
	}
}

// TestPulumiStackImportToNewStack imports state into a fresh stack with no prior deploys.
func TestPulumiStackImportToNewStack(t *testing.T) {
	truncateDB(t)

	home := t.TempDir()
	projectDir := t.TempDir()
	pulumiYAML := `name: import-fresh-project
runtime: yaml
description: E2E test import to fresh stack
outputs:
  msg: "imported state"
`
	if err := os.WriteFile(filepath.Join(projectDir, "Pulumi.yaml"), []byte(pulumiYAML), 0o644); err != nil {
		t.Fatalf("write Pulumi.yaml: %v", err)
	}

	env := &testEnv{
		t:           t,
		home:        home,
		projectDir:  projectDir,
		accessToken: devAuthToken,
	}
	env.login()

	// Create two stacks — deploy to one, export, import to another.
	srcFQN := devOrgLogin + "/import-fresh-project/src"
	dstFQN := devOrgLogin + "/import-fresh-project/dst"
	env.run("stack", "init", "--stack", srcFQN)
	env.run("stack", "init", "--stack", dstFQN)

	env.run("up", "--yes", "--stack", srcFQN)

	exportStdout, _ := env.run("stack", "export", "--stack", srcFQN)

	exportFile := filepath.Join(t.TempDir(), "state.json")
	if err := os.WriteFile(exportFile, []byte(exportStdout), 0o644); err != nil {
		t.Fatalf("write export file: %v", err)
	}

	// Import into the fresh (never deployed) stack. --force needed because stack names differ.
	stdout, stderr := env.run("stack", "import", "--stack", dstFQN, "--file", exportFile, "--force")
	t.Logf("import to fresh stack: %s", combinedOutput(stdout, stderr))

	// Verify exported output matches.
	outStdout, _ := env.run("stack", "output", "--json", "--stack", dstFQN)
	if !strings.Contains(outStdout, "imported state") {
		t.Fatalf("expected 'imported state' in dst stack output, got: %s", outStdout)
	}
}

// TestGetUpdateStatusViaHTTP tests the GET update status endpoint directly.
func TestGetUpdateStatusViaHTTP(t *testing.T) {
	truncateDB(t)
	env := newTestEnv(t, "update-status-project")
	env.login()

	fqn := devOrgLogin + "/update-status-project/dev"
	env.run("stack", "init", "--stack", fqn)
	env.run("up", "--yes", "--stack", fqn)

	// Get the latest update ID from the DB.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var updateID string
	err := dbPool.QueryRow(ctx, `SELECT id::text FROM updates ORDER BY created_at DESC LIMIT 1`).Scan(&updateID)
	if err != nil {
		t.Fatalf("query update ID: %v", err)
	}

	// Hit the get-update-status endpoint.
	resp := env.httpDo("GET", fmt.Sprintf("/api/stacks/%s/update-status-project/dev/update/%s", devOrgLogin, updateID), "")
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var results struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&results); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if results.Status != "succeeded" {
		t.Fatalf("expected status 'succeeded', got %q", results.Status)
	}
}
