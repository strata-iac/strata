package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/pulumi/pulumi/sdk/v3/go/common/apitype"
	"github.com/pulumi/pulumi/sdk/v3/go/common/tokens"

	"github.com/strata-iac/strata/internal/auth"
	"github.com/strata-iac/strata/internal/stacks"
)

// ---------------------------------------------------------------------------
// Mock service
// ---------------------------------------------------------------------------

type mockStackService struct {
	createStackFn   func(ctx context.Context, org, project, stackName string, tags map[string]string) (*apitype.Stack, error)
	getStackFn      func(ctx context.Context, org, project, stack string) (*apitype.Stack, error)
	deleteStackFn   func(ctx context.Context, org, project, stack string, force bool) error
	listStacksFn    func(ctx context.Context, org string, continuationToken *string, tagFilter string) (*apitype.ListStacksResponse, error)
	projectExistsFn func(ctx context.Context, org, project string) (bool, error)
	renameStackFn   func(ctx context.Context, org, project, stack, newName, newProject string) error
	updateTagsFn    func(ctx context.Context, org, project, stack string, tags map[string]string) error
}

func (m *mockStackService) CreateStack(ctx context.Context, org, project, stackName string, tags map[string]string) (*apitype.Stack, error) {
	if m.createStackFn == nil {
		panic("createStackFn not set")
	}
	return m.createStackFn(ctx, org, project, stackName, tags)
}

func (m *mockStackService) GetStack(ctx context.Context, org, project, stack string) (*apitype.Stack, error) {
	if m.getStackFn == nil {
		panic("getStackFn not set")
	}
	return m.getStackFn(ctx, org, project, stack)
}

func (m *mockStackService) DeleteStack(ctx context.Context, org, project, stack string, force bool) error {
	if m.deleteStackFn == nil {
		panic("deleteStackFn not set")
	}
	return m.deleteStackFn(ctx, org, project, stack, force)
}

func (m *mockStackService) ListStacks(ctx context.Context, org string, continuationToken *string, tagFilter string) (*apitype.ListStacksResponse, error) {
	if m.listStacksFn == nil {
		panic("listStacksFn not set")
	}
	return m.listStacksFn(ctx, org, continuationToken, tagFilter)
}

func (m *mockStackService) ProjectExists(ctx context.Context, org, project string) (bool, error) {
	if m.projectExistsFn == nil {
		panic("projectExistsFn not set")
	}
	return m.projectExistsFn(ctx, org, project)
}

func (m *mockStackService) RenameStack(ctx context.Context, org, project, stack, newName, newProject string) error {
	if m.renameStackFn == nil {
		panic("renameStackFn not set")
	}
	return m.renameStackFn(ctx, org, project, stack, newName, newProject)
}

func (m *mockStackService) UpdateTags(ctx context.Context, org, project, stack string, tags map[string]string) error {
	if m.updateTagsFn == nil {
		panic("updateTagsFn not set")
	}
	return m.updateTagsFn(ctx, org, project, stack, tags)
}

func newTestRouter(svc stacks.Service) *chi.Mux {
	h := NewStackHandler(svc)
	r := chi.NewRouter()

	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			caller := &auth.Caller{
				UserID:      "test-user-id",
				GithubLogin: "test-user",
				DisplayName: "Test User",
				Email:       "test@example.com",
				OrgLogin:    "test-org",
				OrgMemberships: []auth.OrgRole{
					{OrgLogin: "test-org", Role: auth.RoleAdmin},
					{OrgLogin: "my-org", Role: auth.RoleAdmin},
				},
			}
			ctx := auth.ContextWithCaller(req.Context(), caller)
			next.ServeHTTP(w, req.WithContext(ctx))
		})
	})

	r.Get("/api/user/stacks", h.ListStacks)
	r.Head("/api/stacks/{org}/{project}", h.ProjectExists)
	r.Post("/api/stacks/{org}/{project}", h.CreateStack)
	r.Get("/api/stacks/{org}/{project}/{stack}", h.GetStack)
	r.Delete("/api/stacks/{org}/{project}/{stack}", h.DeleteStack)
	r.Post("/api/stacks/{org}/{project}/{stack}/rename", h.RenameStack)
	r.Patch("/api/stacks/{org}/{project}/{stack}/tags", h.UpdateTags)

	return r
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func jsonBody(t *testing.T, v any) *bytes.Buffer {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal request body: %v", err)
	}
	return bytes.NewBuffer(b)
}

func decodeJSON(t *testing.T, rec *httptest.ResponseRecorder, v any) {
	t.Helper()
	if err := json.NewDecoder(rec.Body).Decode(v); err != nil {
		t.Fatalf("decode response body: %v", err)
	}
}

// ---------------------------------------------------------------------------
// TestCreateStack
// ---------------------------------------------------------------------------

func TestCreateStack(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		org        string
		project    string
		body       any
		svc        *mockStackService
		wantStatus int
		checkBody  func(t *testing.T, rec *httptest.ResponseRecorder)
	}{
		{
			name:    "happy path",
			org:     "my-org",
			project: "my-project",
			body:    apitype.CreateStackRequest{StackName: "dev"},
			svc: &mockStackService{
				createStackFn: func(_ context.Context, org, project, stackName string, _ map[string]string) (*apitype.Stack, error) {
					return &apitype.Stack{
						OrgName:     org,
						ProjectName: project,
						StackName:   tokens.QName(stackName),
						Version:     1,
					}, nil
				},
			},
			wantStatus: http.StatusOK,
			checkBody: func(t *testing.T, rec *httptest.ResponseRecorder) {
				t.Helper()

				// Parse raw first so we can check both field values and omitempty.
				bodyBytes := rec.Body.Bytes()

				var resp stackResponse
				if err := json.Unmarshal(bodyBytes, &resp); err != nil {
					t.Fatalf("unmarshal response: %v", err)
				}
				if resp.OrgName != "my-org" {
					t.Fatalf("orgName: got %q want %q", resp.OrgName, "my-org")
				}
				if resp.ProjectName != "my-project" {
					t.Fatalf("projectName: got %q want %q", resp.ProjectName, "my-project")
				}
				if resp.StackName != "dev" {
					t.Fatalf("stackName: got %q want %q", resp.StackName, "dev")
				}
				if resp.Version != 1 {
					t.Fatalf("version: got %d want %d", resp.Version, 1)
				}

				// tags and currentOperation must be absent (omitempty)
				var raw map[string]json.RawMessage
				if err := json.Unmarshal(bodyBytes, &raw); err != nil {
					t.Fatalf("unmarshal raw JSON: %v", err)
				}
				if _, ok := raw["tags"]; ok {
					t.Fatalf("expected tags to be absent in JSON, but found it")
				}
				if _, ok := raw["currentOperation"]; ok {
					t.Fatalf("expected currentOperation to be absent in JSON, but found it")
				}
			},
		},
		{
			name:    "with tags — tags present in response",
			org:     "my-org",
			project: "my-project",
			body: apitype.CreateStackRequest{
				StackName: "dev",
				Tags: map[apitype.StackTagName]string{
					"pulumi:project": "my-project",
				},
			},
			svc: &mockStackService{
				createStackFn: func(_ context.Context, org, project, stackName string, _ map[string]string) (*apitype.Stack, error) {
					return &apitype.Stack{
						OrgName:     org,
						ProjectName: project,
						StackName:   tokens.QName(stackName),
						Tags:        map[string]string{"pulumi:project": project},
						Version:     1,
					}, nil
				},
			},
			wantStatus: http.StatusOK,
			checkBody: func(t *testing.T, rec *httptest.ResponseRecorder) {
				t.Helper()
				var raw map[string]json.RawMessage
				if err := json.Unmarshal(rec.Body.Bytes(), &raw); err != nil {
					t.Fatalf("unmarshal raw JSON: %v", err)
				}
				if _, ok := raw["tags"]; !ok {
					t.Fatalf("expected tags to be present in JSON")
				}
			},
		},
		{
			name:       "missing stackName",
			org:        "my-org",
			project:    "my-project",
			body:       map[string]string{},
			svc:        &mockStackService{},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:    "duplicate stack",
			org:     "my-org",
			project: "my-project",
			body:    apitype.CreateStackRequest{StackName: "dev"},
			svc: &mockStackService{
				createStackFn: func(context.Context, string, string, string, map[string]string) (*apitype.Stack, error) {
					return nil, stacks.ErrStackAlreadyExists
				},
			},
			wantStatus: http.StatusConflict,
		},
		{
			name:       "invalid JSON body",
			org:        "my-org",
			project:    "my-project",
			body:       nil, // will send empty body
			svc:        &mockStackService{},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			router := newTestRouter(tc.svc)

			var reqBody *bytes.Buffer
			if tc.body != nil {
				reqBody = jsonBody(t, tc.body)
			} else {
				reqBody = bytes.NewBufferString("{invalid")
			}

			req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/api/stacks/"+tc.org+"/"+tc.project, reqBody)
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			if rec.Code != tc.wantStatus {
				t.Fatalf("status: got %d want %d, body: %s", rec.Code, tc.wantStatus, rec.Body.String())
			}

			if tc.checkBody != nil {
				// Re-run to get fresh recorder for body checks that consume the body twice.
				// Instead, we just re-create the recorder since rawJSON re-reads from bytes.
				tc.checkBody(t, rec)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// TestGetStack
// ---------------------------------------------------------------------------

func TestGetStack(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		svc        *mockStackService
		wantStatus int
		checkBody  func(t *testing.T, rec *httptest.ResponseRecorder)
	}{
		{
			name: "happy path",
			svc: &mockStackService{
				getStackFn: func(_ context.Context, org, project, stack string) (*apitype.Stack, error) {
					return &apitype.Stack{
						OrgName:     org,
						ProjectName: project,
						StackName:   tokens.QName(stack),
						Version:     3,
					}, nil
				},
			},
			wantStatus: http.StatusOK,
			checkBody: func(t *testing.T, rec *httptest.ResponseRecorder) {
				t.Helper()
				var resp stackResponse
				decodeJSON(t, rec, &resp)
				if resp.StackName != "dev" {
					t.Fatalf("stackName: got %q want %q", resp.StackName, "dev")
				}
				if resp.Version != 3 {
					t.Fatalf("version: got %d want %d", resp.Version, 3)
				}
			},
		},
		{
			name: "not found",
			svc: &mockStackService{
				getStackFn: func(context.Context, string, string, string) (*apitype.Stack, error) {
					return nil, nil
				},
			},
			wantStatus: http.StatusNotFound,
		},
		{
			name: "service error",
			svc: &mockStackService{
				getStackFn: func(context.Context, string, string, string) (*apitype.Stack, error) {
					return nil, stacks.ErrStackNotFound
				},
			},
			wantStatus: http.StatusInternalServerError,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			router := newTestRouter(tc.svc)
			req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/stacks/my-org/my-project/dev", nil)
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			if rec.Code != tc.wantStatus {
				t.Fatalf("status: got %d want %d, body: %s", rec.Code, tc.wantStatus, rec.Body.String())
			}

			if tc.checkBody != nil {
				tc.checkBody(t, rec)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// TestDeleteStack
// ---------------------------------------------------------------------------

func TestDeleteStack(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		path       string
		query      string
		svc        *mockStackService
		wantStatus int
	}{
		{
			name: "happy path",
			path: "/api/stacks/my-org/my-project/dev",
			svc: &mockStackService{
				deleteStackFn: func(_ context.Context, _, _, _ string, _ bool) error {
					return nil
				},
			},
			wantStatus: http.StatusOK,
		},
		{
			name:  "force=true passed to service",
			path:  "/api/stacks/my-org/my-project/dev",
			query: "force=true",
			svc: &mockStackService{
				deleteStackFn: func(_ context.Context, _, _, _ string, force bool) error {
					if !force {
						panic("expected force=true")
					}
					return nil
				},
			},
			wantStatus: http.StatusOK,
		},
		{
			name: "stack has resources",
			path: "/api/stacks/my-org/my-project/dev",
			svc: &mockStackService{
				deleteStackFn: func(context.Context, string, string, string, bool) error {
					return stacks.ErrStackHasResources
				},
			},
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "stack not found",
			path: "/api/stacks/my-org/my-project/dev",
			svc: &mockStackService{
				deleteStackFn: func(context.Context, string, string, string, bool) error {
					return stacks.ErrStackNotFound
				},
			},
			wantStatus: http.StatusNotFound,
		},
		{
			name:       "invalid force param",
			path:       "/api/stacks/my-org/my-project/dev",
			query:      "force=notabool",
			svc:        &mockStackService{},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			router := newTestRouter(tc.svc)
			target := tc.path
			if tc.query != "" {
				target += "?" + tc.query
			}
			req := httptest.NewRequestWithContext(context.Background(), http.MethodDelete, target, nil)
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			if rec.Code != tc.wantStatus {
				t.Fatalf("status: got %d want %d, body: %s", rec.Code, tc.wantStatus, rec.Body.String())
			}
		})
	}
}

// ---------------------------------------------------------------------------
// TestListStacks
// ---------------------------------------------------------------------------

func TestListStacks(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		query      string
		svc        *mockStackService
		wantStatus int
		checkBody  func(t *testing.T, rec *httptest.ResponseRecorder)
	}{
		{
			name:  "happy path with org param",
			query: "organization=my-org",
			svc: &mockStackService{
				listStacksFn: func(_ context.Context, org string, _ *string, _ string) (*apitype.ListStacksResponse, error) {
					if org != "my-org" {
						panic("expected org=my-org, got " + org)
					}
					return &apitype.ListStacksResponse{
						Stacks: []apitype.StackSummary{
							{OrgName: org, ProjectName: "proj", StackName: "dev"},
						},
					}, nil
				},
			},
			wantStatus: http.StatusOK,
			checkBody: func(t *testing.T, rec *httptest.ResponseRecorder) {
				t.Helper()
				var resp apitype.ListStacksResponse
				decodeJSON(t, rec, &resp)
				if len(resp.Stacks) != 1 {
					t.Fatalf("stacks count: got %d want 1", len(resp.Stacks))
				}
			},
		},
		{
			name:  "no org param — uses caller org",
			query: "",
			svc: &mockStackService{
				listStacksFn: func(_ context.Context, org string, _ *string, _ string) (*apitype.ListStacksResponse, error) {
					if org != "test-org" {
						panic("expected org=test-org (from caller), got " + org)
					}
					return &apitype.ListStacksResponse{
						Stacks: []apitype.StackSummary{},
					}, nil
				},
			},
			wantStatus: http.StatusOK,
		},
		{
			name:  "with continuationToken",
			query: "organization=my-org&continuationToken=abc123",
			svc: &mockStackService{
				listStacksFn: func(_ context.Context, _ string, token *string, _ string) (*apitype.ListStacksResponse, error) {
					if token == nil || *token != "abc123" {
						panic("expected continuationToken=abc123")
					}
					return &apitype.ListStacksResponse{
						Stacks: []apitype.StackSummary{},
					}, nil
				},
			},
			wantStatus: http.StatusOK,
		},
		{
			name:  "empty list",
			query: "organization=my-org",
			svc: &mockStackService{
				listStacksFn: func(context.Context, string, *string, string) (*apitype.ListStacksResponse, error) {
					return &apitype.ListStacksResponse{
						Stacks: []apitype.StackSummary{},
					}, nil
				},
			},
			wantStatus: http.StatusOK,
			checkBody: func(t *testing.T, rec *httptest.ResponseRecorder) {
				t.Helper()
				var resp apitype.ListStacksResponse
				decodeJSON(t, rec, &resp)
				if resp.Stacks == nil {
					t.Fatalf("stacks should be empty slice, not nil")
				}
				if len(resp.Stacks) != 0 {
					t.Fatalf("stacks count: got %d want 0", len(resp.Stacks))
				}
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			router := newTestRouter(tc.svc)
			target := "/api/user/stacks"
			if tc.query != "" {
				target += "?" + tc.query
			}
			req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, target, nil)
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			if rec.Code != tc.wantStatus {
				t.Fatalf("status: got %d want %d, body: %s", rec.Code, tc.wantStatus, rec.Body.String())
			}

			if tc.checkBody != nil {
				tc.checkBody(t, rec)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// TestProjectExists
// ---------------------------------------------------------------------------

func TestProjectExists(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		svc        *mockStackService
		wantStatus int
	}{
		{
			name: "project exists",
			svc: &mockStackService{
				projectExistsFn: func(context.Context, string, string) (bool, error) {
					return true, nil
				},
			},
			wantStatus: http.StatusOK,
		},
		{
			name: "project does not exist",
			svc: &mockStackService{
				projectExistsFn: func(context.Context, string, string) (bool, error) {
					return false, nil
				},
			},
			wantStatus: http.StatusNotFound,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			router := newTestRouter(tc.svc)
			req := httptest.NewRequestWithContext(context.Background(), http.MethodHead, "/api/stacks/my-org/my-project", nil)
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			if rec.Code != tc.wantStatus {
				t.Fatalf("status: got %d want %d", rec.Code, tc.wantStatus)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// TestRenameStack
// ---------------------------------------------------------------------------

func TestRenameStack(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		body       any
		svc        *mockStackService
		wantStatus int
	}{
		{
			name: "happy path — rename",
			body: apitype.StackRenameRequest{NewName: "staging"},
			svc: &mockStackService{
				renameStackFn: func(_ context.Context, _, _, _, newName, _ string) error {
					if newName != "staging" {
						panic("expected newName=staging, got " + newName)
					}
					return nil
				},
			},
			wantStatus: http.StatusOK,
		},
		{
			name: "happy path — move project",
			body: apitype.StackRenameRequest{NewProject: "other-project"},
			svc: &mockStackService{
				renameStackFn: func(_ context.Context, _, _, _, _, newProject string) error {
					if newProject != "other-project" {
						panic("expected newProject=other-project, got " + newProject)
					}
					return nil
				},
			},
			wantStatus: http.StatusOK,
		},
		{
			name:       "both empty",
			body:       apitype.StackRenameRequest{},
			svc:        &mockStackService{},
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "stack not found",
			body: apitype.StackRenameRequest{NewName: "staging"},
			svc: &mockStackService{
				renameStackFn: func(context.Context, string, string, string, string, string) error {
					return stacks.ErrStackNotFound
				},
			},
			wantStatus: http.StatusNotFound,
		},
		{
			name: "conflict",
			body: apitype.StackRenameRequest{NewName: "staging"},
			svc: &mockStackService{
				renameStackFn: func(context.Context, string, string, string, string, string) error {
					return stacks.ErrStackAlreadyExists
				},
			},
			wantStatus: http.StatusConflict,
		},
		{
			name:       "invalid JSON",
			body:       nil,
			svc:        &mockStackService{},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			router := newTestRouter(tc.svc)

			var reqBody *bytes.Buffer
			if tc.body != nil {
				reqBody = jsonBody(t, tc.body)
			} else {
				reqBody = bytes.NewBufferString("{invalid")
			}

			req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/api/stacks/my-org/my-project/dev/rename", reqBody)
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			if rec.Code != tc.wantStatus {
				t.Fatalf("status: got %d want %d, body: %s", rec.Code, tc.wantStatus, rec.Body.String())
			}
		})
	}
}

func TestUpdateTags(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		body       any
		svc        *mockStackService
		wantStatus int
	}{
		{
			name: "happy path",
			body: map[string]string{"pulumi:project": "my-project", "env": "prod"},
			svc: &mockStackService{
				updateTagsFn: func(_ context.Context, org, project, stack string, tags map[string]string) error {
					if org != "my-org" || project != "my-project" || stack != "dev" {
						t.Errorf("unexpected params: org=%s project=%s stack=%s", org, project, stack)
					}
					if tags["env"] != "prod" {
						t.Errorf("expected tag env=prod, got %s", tags["env"])
					}
					return nil
				},
			},
			wantStatus: http.StatusNoContent,
		},
		{
			name: "stack not found",
			body: map[string]string{"env": "prod"},
			svc: &mockStackService{
				updateTagsFn: func(context.Context, string, string, string, map[string]string) error {
					return stacks.ErrStackNotFound
				},
			},
			wantStatus: http.StatusNotFound,
		},
		{
			name:       "invalid JSON",
			body:       nil,
			svc:        &mockStackService{updateTagsFn: func(context.Context, string, string, string, map[string]string) error { return nil }},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			router := newTestRouter(tc.svc)

			var reqBody *bytes.Buffer
			if tc.body != nil {
				reqBody = jsonBody(t, tc.body)
			} else {
				reqBody = bytes.NewBufferString("{invalid")
			}

			req := httptest.NewRequestWithContext(context.Background(), http.MethodPatch, "/api/stacks/my-org/my-project/dev/tags", reqBody)
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			if rec.Code != tc.wantStatus {
				t.Fatalf("status: got %d want %d, body: %s", rec.Code, tc.wantStatus, rec.Body.String())
			}
		})
	}
}

func TestCLIVersion(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/cli/version", nil)
	rr := httptest.NewRecorder()

	CLIVersion(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	var resp apitype.CLIVersionResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.LatestVersion == "" {
		t.Fatal("expected non-empty latestVersion")
	}
	if resp.OldestWithoutWarning == "" {
		t.Fatal("expected non-empty oldestWithoutWarning")
	}
}

func TestDefaultOrganization(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/user/organizations/default", nil)
	caller := &auth.Caller{
		UserID:      "test-user-id",
		GithubLogin: "test-user",
		DisplayName: "Test User",
		Email:       "test@example.com",
		OrgLogin:    "test-org",
	}
	ctx := auth.ContextWithCaller(req.Context(), caller)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	DefaultOrganization(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	var resp struct {
		GitHubLogin string `json:"gitHubLogin"`
	}
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.GitHubLogin != "test-org" {
		t.Fatalf("expected gitHubLogin=test-org, got %s", resp.GitHubLogin)
	}
}

func TestDefaultOrganization_Unauthorized(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/user/organizations/default", nil)
	rr := httptest.NewRecorder()
	DefaultOrganization(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", rr.Code, rr.Body.String())
	}
}
