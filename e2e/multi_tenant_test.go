//go:build e2e

package e2e

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestCrossOrgAccessDenied(t *testing.T) {
	truncateDB(t)

	envA := newTestEnv(t, "cross-org-a")
	envA.login()
	envA.run("stack", "init", "--stack", devOrgLogin+"/cross-org-a/dev")

	envB := newTestEnvWithToken(t, "cross-org-b", userBToken)
	resp := envB.httpDo(http.MethodGet, "/api/stacks/"+devOrgLogin+"/cross-org-a/dev", "")
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusForbidden {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("user-b accessing dev-org stack: expected 403, got %d: %s", resp.StatusCode, body)
	}
}

func TestCrossOrgCreateDenied(t *testing.T) {
	truncateDB(t)

	envB := newTestEnvWithToken(t, "cross-org-create", userBToken)
	resp := envB.httpDo(http.MethodPost, "/api/stacks/"+devOrgLogin+"/cross-org-create",
		`{"stackName":"hacked"}`)
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusForbidden {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("user-b creating stack in dev-org: expected 403, got %d: %s", resp.StatusCode, body)
	}
}

func TestCrossOrgDeleteDenied(t *testing.T) {
	truncateDB(t)

	envA := newTestEnv(t, "cross-org-delete")
	envA.login()
	envA.run("stack", "init", "--stack", devOrgLogin+"/cross-org-delete/target")

	envB := newTestEnvWithToken(t, "cross-org-delete-b", userBToken)
	resp := envB.httpDo(http.MethodDelete, "/api/stacks/"+devOrgLogin+"/cross-org-delete/target", "")
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusForbidden {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("user-b deleting dev-org stack: expected 403, got %d: %s", resp.StatusCode, body)
	}
}

func TestOwnOrgAccessAllowed(t *testing.T) {
	truncateDB(t)

	envB := newTestEnvWithToken(t, "own-org-b", userBToken)
	envB.login()
	envB.run("stack", "init", "--stack", userBOrg+"/own-org-b/dev")

	resp := envB.httpDo(http.MethodGet, "/api/stacks/"+userBOrg+"/own-org-b/dev", "")
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("user-b accessing own org stack: expected 200, got %d: %s", resp.StatusCode, body)
	}
}

func TestListStacksIsolation(t *testing.T) {
	truncateDB(t)

	envA := newTestEnv(t, "isolation-a")
	envA.login()
	envA.run("stack", "init", "--stack", devOrgLogin+"/isolation-a/stack-a")

	envB := newTestEnvWithToken(t, "isolation-b", userBToken)
	envB.login()
	envB.run("stack", "init", "--stack", userBOrg+"/isolation-b/stack-b")

	respA := envA.httpDo(http.MethodGet, "/api/user/stacks?organization="+devOrgLogin, "")
	defer respA.Body.Close()
	bodyA, _ := io.ReadAll(respA.Body)
	if respA.StatusCode != http.StatusOK {
		t.Fatalf("user-a list stacks: expected 200, got %d: %s", respA.StatusCode, bodyA)
	}

	var listA struct {
		Stacks []struct{ OrgName string } `json:"stacks"`
	}
	if err := json.Unmarshal(bodyA, &listA); err != nil {
		t.Fatalf("parse user-a stacks: %v", err)
	}
	for _, s := range listA.Stacks {
		if s.OrgName != devOrgLogin {
			t.Fatalf("user-a sees stack from wrong org: %s", s.OrgName)
		}
	}

	respBCross := envB.httpDo(http.MethodGet, "/api/user/stacks?organization="+devOrgLogin, "")
	defer respBCross.Body.Close()
	if respBCross.StatusCode != http.StatusForbidden {
		body, _ := io.ReadAll(respBCross.Body)
		t.Fatalf("user-b listing dev-org stacks: expected 403, got %d: %s", respBCross.StatusCode, body)
	}

	respB := envB.httpDo(http.MethodGet, "/api/user/stacks?organization="+userBOrg, "")
	defer respB.Body.Close()
	bodyB, _ := io.ReadAll(respB.Body)
	if respB.StatusCode != http.StatusOK {
		t.Fatalf("user-b list own stacks: expected 200, got %d: %s", respB.StatusCode, bodyB)
	}

	var listB struct {
		Stacks []struct{ OrgName string } `json:"stacks"`
	}
	if err := json.Unmarshal(bodyB, &listB); err != nil {
		t.Fatalf("parse user-b stacks: %v", err)
	}
	for _, s := range listB.Stacks {
		if s.OrgName != userBOrg {
			t.Fatalf("user-b sees stack from wrong org: %s", s.OrgName)
		}
	}
}

func TestViewerCanReadButNotWrite(t *testing.T) {
	truncateDB(t)

	envAdmin := newTestEnv(t, "viewer-test")
	envAdmin.login()
	envAdmin.run("stack", "init", "--stack", devOrgLogin+"/viewer-test/target")

	envViewer := newTestEnvWithToken(t, "viewer-test-v", viewerToken)

	readResp := envViewer.httpDo(http.MethodGet, "/api/stacks/"+devOrgLogin+"/viewer-test/target", "")
	defer readResp.Body.Close()
	if readResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(readResp.Body)
		t.Fatalf("viewer reading stack: expected 200, got %d: %s", readResp.StatusCode, body)
	}

	createResp := envViewer.httpDo(http.MethodPost, "/api/stacks/"+devOrgLogin+"/viewer-test",
		`{"stackName":"viewer-created"}`)
	defer createResp.Body.Close()
	if createResp.StatusCode != http.StatusForbidden {
		body, _ := io.ReadAll(createResp.Body)
		t.Fatalf("viewer creating stack: expected 403, got %d: %s", createResp.StatusCode, body)
	}

	deleteResp := envViewer.httpDo(http.MethodDelete, "/api/stacks/"+devOrgLogin+"/viewer-test/target", "")
	defer deleteResp.Body.Close()
	if deleteResp.StatusCode != http.StatusForbidden {
		body, _ := io.ReadAll(deleteResp.Body)
		t.Fatalf("viewer deleting stack: expected 403, got %d: %s", deleteResp.StatusCode, body)
	}
}

func TestViewerCannotListOtherOrg(t *testing.T) {
	truncateDB(t)

	envViewer := newTestEnvWithToken(t, "viewer-cross-org", viewerToken)
	resp := envViewer.httpDo(http.MethodGet, "/api/user/stacks?organization="+userBOrg, "")
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusForbidden {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("viewer listing other org stacks: expected 403, got %d: %s", resp.StatusCode, body)
	}
}

func TestInvalidTokenDenied(t *testing.T) {
	truncateDB(t)

	envBad := newTestEnvWithToken(t, "invalid-token", "totally-wrong-token")
	resp := envBad.httpDo(http.MethodGet, "/api/stacks/"+devOrgLogin+"/any/stack", "")
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("invalid token: expected 401, got %d: %s", resp.StatusCode, body)
	}
}

func TestUserEndpointShowsOwnOrg(t *testing.T) {
	truncateDB(t)

	envB := newTestEnvWithToken(t, "user-org-check", userBToken)
	resp := envB.httpDo(http.MethodGet, "/api/user", "")
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("user endpoint: expected 200, got %d: %s", resp.StatusCode, body)
	}

	var userResp struct {
		GithubLogin   string `json:"githubLogin"`
		Organizations []struct {
			GithubLogin string `json:"githubLogin"`
		} `json:"organizations"`
	}
	if err := json.Unmarshal(body, &userResp); err != nil {
		t.Fatalf("parse user response: %v", err)
	}

	if userResp.GithubLogin != userBLogin {
		t.Fatalf("expected githubLogin=%s, got %s", userBLogin, userResp.GithubLogin)
	}

	if len(userResp.Organizations) != 1 {
		t.Fatalf("expected 1 organization, got %d", len(userResp.Organizations))
	}

	if userResp.Organizations[0].GithubLogin != userBOrg {
		t.Fatalf("expected org=%s, got %s", userBOrg, userResp.Organizations[0].GithubLogin)
	}
}

func TestDefaultOrgEndpoint(t *testing.T) {
	truncateDB(t)

	envB := newTestEnvWithToken(t, "default-org-check", userBToken)
	resp := envB.httpDo(http.MethodGet, "/api/user/organizations/default", "")
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("default org: expected 200, got %d: %s", resp.StatusCode, body)
	}

	if !strings.Contains(string(body), userBOrg) {
		t.Fatalf("expected default org to contain %s, got: %s", userBOrg, body)
	}
}
