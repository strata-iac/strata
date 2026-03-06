//go:build e2e

package e2e

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"
)

func startCluster(t *testing.T, n int) []string {
	t.Helper()
	if strataBinary == "" {
		t.Fatal("strataBinary not set")
	}

	blobDir := filepath.Join(t.TempDir(), "blobs")
	if err := os.MkdirAll(blobDir, 0o750); err != nil {
		t.Fatalf("create shared blob dir: %v", err)
	}

	databaseURL := os.Getenv("STRATA_DATABASE_URL")
	if databaseURL == "" {
		databaseURL = "postgres://strata:strata@localhost:5432/strata?sslmode=disable"
	}

	urls := make([]string, 0, n)
	for i := range n {
		port, err := freePort()
		if err != nil {
			t.Fatalf("find free port for instance %d: %v", i, err)
		}

		url := fmt.Sprintf("http://127.0.0.1:%d", port)

		ctx, cancel := context.WithCancel(context.Background())
		cmd := exec.CommandContext(ctx, strataBinary)
		cmd.Env = []string{
			"PATH=" + os.Getenv("PATH"),
			"HOME=" + os.Getenv("HOME"),
			fmt.Sprintf("STRATA_LISTEN_ADDR=:%d", port),
			"STRATA_DATABASE_URL=" + databaseURL,
			"STRATA_AUTH_MODE=dev",
			"STRATA_DEV_AUTH_TOKEN=" + devAuthToken,
			"STRATA_DEV_USER_LOGIN=" + devUserLogin,
			"STRATA_DEV_ORG_LOGIN=" + devOrgLogin,
			"STRATA_DEV_USERS=" + devUsersJSON,
			"STRATA_BLOB_BACKEND=local",
			"STRATA_BLOB_LOCAL_PATH=" + blobDir,
		}
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr

		if err := cmd.Start(); err != nil {
			cancel()
			t.Fatalf("start instance %d: %v", i, err)
		}

		t.Cleanup(func() {
			cancel()
			done := make(chan error, 1)
			go func() { done <- cmd.Wait() }()
			select {
			case <-done:
			case <-time.After(5 * time.Second):
				_ = cmd.Process.Signal(syscall.SIGKILL)
				<-done
			}
		})

		if err := waitForHealthy(url+"/healthz", 15*time.Second); err != nil {
			t.Fatalf("instance %d not healthy: %v", i, err)
		}

		urls = append(urls, url)
	}

	t.Logf("cluster: %d instances at %v", n, urls)
	return urls
}

func TestClusterStackVisibility(t *testing.T) {
	truncateDB(t)
	instances := startCluster(t, 3)

	env0 := newTestEnv(t, "cluster-vis")
	env0.serverURL = instances[0]
	env0.login()
	env0.run("stack", "init", "--stack", devOrgLogin+"/cluster-vis/dev")

	env1 := newTestEnv(t, "cluster-vis")
	env1.serverURL = instances[1]
	env1.login()
	stdout, _ := env1.run("stack", "ls", "--json")
	stacks := mustJSON[[]stackEntry](t, stdout)
	if len(stacks) != 1 {
		t.Fatalf("instance 1: expected 1 stack, got %d: %s", len(stacks), stdout)
	}

	env2 := newTestEnv(t, "cluster-vis")
	env2.serverURL = instances[2]
	env2.login()
	stdout, _ = env2.run("stack", "ls", "--json")
	stacks = mustJSON[[]stackEntry](t, stdout)
	if len(stacks) != 1 {
		t.Fatalf("instance 2: expected 1 stack, got %d: %s", len(stacks), stdout)
	}
}

func TestClusterUpdateLifecycle(t *testing.T) {
	truncateDB(t)
	instances := startCluster(t, 3)

	org := devOrgLogin
	project := "cluster-update"
	stack := "dev"
	fqn := org + "/" + project + "/" + stack
	basePath := fmt.Sprintf("/api/stacks/%s/%s/%s", org, project, stack)
	apiAuth := "token " + devAuthToken

	env := newTestEnv(t, project)
	env.serverURL = instances[0]
	env.login()
	env.run("stack", "init", "--stack", fqn)

	var createResult struct {
		UpdateID string `json:"updateID"`
	}
	mustHTTP(t, instances[0], "POST", basePath+"/update", apiAuth,
		`{"name":"cluster-update","runtime":"yaml"}`, http.StatusOK, &createResult)
	updateID := createResult.UpdateID
	t.Logf("created update %s on instance 0", updateID)

	var startResult struct {
		Version int    `json:"version"`
		Token   string `json:"token"`
	}
	mustHTTP(t, instances[1], "POST", basePath+"/update/"+updateID, apiAuth,
		`{}`, http.StatusOK, &startResult)
	leaseAuth := "update-token " + startResult.Token
	t.Logf("started update on instance 1, version=%d", startResult.Version)

	checkpoint := `{"version":3,"deployment":{"manifest":{"time":"2024-01-01T00:00:00Z","magic":"","version":""},"resources":[{"urn":"urn:pulumi:dev::cluster-update::pulumi:pulumi:Stack::cluster-update-dev","custom":false,"type":"pulumi:pulumi:Stack"}]}}`
	verbatimReq := fmt.Sprintf(`{"version":1,"sequenceNumber":1,"untypedDeployment":%s}`, checkpoint)
	mustHTTP(t, instances[2], "PATCH", basePath+"/update/"+updateID+"/checkpointverbatim", leaseAuth,
		verbatimReq, http.StatusOK, nil)
	t.Log("patched checkpoint on instance 2")

	mustHTTP(t, instances[0], "POST", basePath+"/update/"+updateID+"/complete", leaseAuth,
		`{"status":"succeeded"}`, http.StatusOK, nil)
	t.Log("completed update on instance 0")

	var deployment map[string]any
	mustHTTP(t, instances[1], "GET", basePath+"/export", apiAuth,
		"", http.StatusOK, &deployment)
	if deployment["deployment"] == nil {
		t.Fatal("exported deployment is nil on instance 1")
	}
	t.Log("verified export on instance 1")
}

func TestClusterCancelAcrossInstances(t *testing.T) {
	truncateDB(t)
	instances := startCluster(t, 2)

	org := devOrgLogin
	project := "cluster-cancel"
	stack := "dev"
	fqn := org + "/" + project + "/" + stack
	basePath := fmt.Sprintf("/api/stacks/%s/%s/%s", org, project, stack)
	apiAuth := "token " + devAuthToken

	env := newTestEnv(t, project)
	env.serverURL = instances[0]
	env.login()
	env.run("stack", "init", "--stack", fqn)

	var createResult struct {
		UpdateID string `json:"updateID"`
	}
	mustHTTP(t, instances[0], "POST", basePath+"/update", apiAuth,
		`{"name":"cluster-cancel","runtime":"yaml"}`, http.StatusOK, &createResult)
	updateID := createResult.UpdateID

	var startResult struct {
		Token string `json:"token"`
	}
	mustHTTP(t, instances[0], "POST", basePath+"/update/"+updateID, apiAuth,
		`{}`, http.StatusOK, &startResult)
	leaseAuth := "update-token " + startResult.Token

	mustHTTP(t, instances[1], "POST", basePath+"/update/"+updateID+"/cancel", apiAuth,
		"", http.StatusOK, nil)
	t.Log("cancelled update on instance 1")

	resp := doHTTP(t, instances[0], "PATCH", basePath+"/update/"+updateID+"/checkpointverbatim", leaseAuth,
		`{"version":1,"sequenceNumber":1,"untypedDeployment":{"version":3,"deployment":{}}}`)
	resp.Body.Close()
	if resp.StatusCode == http.StatusOK {
		t.Fatal("expected checkpoint to fail after cross-instance cancel, but got 200")
	}
	t.Logf("checkpoint correctly rejected with %d after cancel", resp.StatusCode)
}

func mustHTTP(t *testing.T, baseURL, method, path, authHeader, body string, expectedStatus int, result any) {
	t.Helper()
	resp := doHTTP(t, baseURL, method, path, authHeader, body)
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read response: %v", err)
	}

	if resp.StatusCode != expectedStatus {
		t.Fatalf("%s %s: expected %d, got %d: %s", method, path, expectedStatus, resp.StatusCode, respBody)
	}

	if result != nil {
		if err := json.Unmarshal(respBody, result); err != nil {
			t.Fatalf("unmarshal response: %v\nbody: %s", err, respBody)
		}
	}
}

func doHTTP(t *testing.T, baseURL, method, path, authHeader, body string) *http.Response {
	t.Helper()
	var bodyReader io.Reader
	if body != "" {
		bodyReader = strings.NewReader(body)
	}
	req, err := http.NewRequestWithContext(context.Background(), method, baseURL+path, bodyReader)
	if err != nil {
		t.Fatalf("create request: %v", err)
	}
	req.Header.Set("Authorization", authHeader)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/vnd.pulumi+8")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("http %s %s%s: %v", method, baseURL, path, err)
	}
	return resp
}
