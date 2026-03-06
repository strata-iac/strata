//go:build e2e

package e2e

import (
	"bytes"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

type exampleSpec struct {
	name          string
	secretConfigs map[string]string
	skipDestroy   bool
}

var exampleSpecs = []exampleSpec{
	{name: "multi-resource"},
	{name: "secrets-heavy", secretConfigs: map[string]string{"dbPassword": "test-pass-123"}},
	{name: "component"},
	{name: "replace-triggers"},
	{name: "large-state"},
	{name: "protect", skipDestroy: true},
	// stack-ref is excluded: it requires multi-resource deployed on a specific stack name simultaneously.
}

func TestExamples(t *testing.T) {
	truncateDB(t)

	sharedHome := t.TempDir()
	examplePulumi(t, t.TempDir(), sharedHome, "login", strataURL)

	for _, spec := range exampleSpecs {
		t.Run(spec.name, func(t *testing.T) {
			runExampleLifecycle(t, sharedHome, spec)
		})
	}
}

func runExampleLifecycle(t *testing.T, pulumiHome string, spec exampleSpec) {
	t.Helper()

	srcDir := filepath.Join(projectRoot, "examples", spec.name)
	workDir := copyExampleDir(t, srcDir)
	goModTidy(t, workDir)

	run := func(args ...string) (string, string) {
		return examplePulumi(t, workDir, pulumiHome, args...)
	}

	stackFQN := devOrgLogin + "/" + spec.name + "/e2e"

	run("stack", "init", "--stack", stackFQN)

	for key, val := range spec.secretConfigs {
		run("config", "set", "--secret", "--stack", stackFQN, key, val)
	}

	run("up", "--yes", "--stack", stackFQN)
	run("preview", "--stack", stackFQN)
	run("refresh", "--yes", "--stack", stackFQN)

	stdout, _ := run("stack", "export", "--stack", stackFQN)
	exportFile := filepath.Join(t.TempDir(), "state.json")
	if err := os.WriteFile(exportFile, []byte(stdout), 0o644); err != nil {
		t.Fatalf("write export file: %v", err)
	}
	run("stack", "import", "--stack", stackFQN, "--file", exportFile)

	if !spec.skipDestroy {
		run("destroy", "--yes", "--stack", stackFQN)
	}

	run("stack", "rm", "--yes", "--force", "--stack", stackFQN)
}

func examplePulumi(t *testing.T, dir, pulumiHome string, args ...string) (string, string) {
	t.Helper()

	cmd := exec.Command("pulumi", args...)
	cmd.Dir = dir
	cmd.Env = pulumiEnv(pulumiHome)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		t.Fatalf("pulumi %s failed: %v\nstdout:\n%s\nstderr:\n%s",
			strings.Join(args, " "), err, stdout.String(), stderr.String())
	}
	return stdout.String(), stderr.String()
}

func pulumiEnv(pulumiHome string) []string {
	overrides := map[string]string{
		"PULUMI_HOME":              pulumiHome,
		"PULUMI_ACCESS_TOKEN":      devAuthToken,
		"PULUMI_SKIP_UPDATE_CHECK": "true",
		"PULUMI_CONFIG_PASSPHRASE": "test",
		"PULUMI_DIY_BACKEND_URL":   "",
		"PULUMI_BACKEND_URL":       "",
	}

	var env []string
	for _, e := range os.Environ() {
		key, _, _ := strings.Cut(e, "=")
		if _, ok := overrides[key]; !ok {
			env = append(env, e)
		}
	}
	for k, v := range overrides {
		env = append(env, k+"="+v)
	}
	return env
}

func goModTidy(t *testing.T, dir string) {
	t.Helper()
	cmd := exec.Command("go", "mod", "tidy")
	cmd.Dir = dir
	cmd.Env = os.Environ()
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("go mod tidy in %s: %v\n%s", filepath.Base(dir), err, out)
	}
}

func copyExampleDir(t *testing.T, src string) string {
	t.Helper()
	dst := t.TempDir()

	entries, err := os.ReadDir(src)
	if err != nil {
		t.Fatalf("read example dir %s: %v", src, err)
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		srcPath := filepath.Join(src, entry.Name())
		dstPath := filepath.Join(dst, entry.Name())
		cpFile(t, srcPath, dstPath)
	}

	return dst
}

func cpFile(t *testing.T, src, dst string) {
	t.Helper()
	in, err := os.Open(src)
	if err != nil {
		t.Fatalf("open %s: %v", src, err)
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		t.Fatalf("create %s: %v", dst, err)
	}
	defer out.Close()

	if _, err := io.Copy(out, in); err != nil {
		t.Fatalf("copy %s: %v", filepath.Base(src), err)
	}
}
