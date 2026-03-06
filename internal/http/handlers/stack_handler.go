package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/pulumi/pulumi/sdk/v3/go/common/apitype"

	"github.com/strata-iac/strata/internal/auth"
	"github.com/strata-iac/strata/internal/http/encode"
	"github.com/strata-iac/strata/internal/stacks"
)

type StackHandler struct {
	stacks stacks.Service
}

func NewStackHandler(svc stacks.Service) *StackHandler {
	return &StackHandler{stacks: svc}
}

type stackResponse struct {
	ID               string            `json:"id"`
	OrgName          string            `json:"orgName"`
	ProjectName      string            `json:"projectName"`
	StackName        string            `json:"stackName"`
	CurrentOperation any               `json:"currentOperation"`
	ActiveUpdate     string            `json:"activeUpdate"`
	Tags             map[string]string `json:"tags"`
	Version          int               `json:"version"`
}

func (h *StackHandler) CreateStack(w http.ResponseWriter, r *http.Request) {
	org := chi.URLParam(r, "org")
	project := chi.URLParam(r, "project")
	if org == "" || project == "" {
		encode.WriteError(w, http.StatusBadRequest, "Bad Request: missing org or project")
		return
	}

	var req apitype.CreateStackRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		encode.WriteError(w, http.StatusBadRequest, "Bad Request: invalid JSON body")
		return
	}

	if req.StackName == "" {
		encode.WriteError(w, http.StatusBadRequest, "Bad Request: stackName is required")
		return
	}

	stack, err := h.stacks.CreateStack(r.Context(), org, project, req.StackName, stackTagsToMap(req.Tags))
	if err != nil {
		switch {
		case errors.Is(err, stacks.ErrStackAlreadyExists):
			encode.WriteError(w, http.StatusConflict, err.Error())
		default:
			encode.WriteError(w, http.StatusInternalServerError, "Internal Server Error")
		}
		return
	}

	encode.WriteJSON(w, http.StatusOK, stackToResponse(stack))
}

func (h *StackHandler) GetStack(w http.ResponseWriter, r *http.Request) {
	org := chi.URLParam(r, "org")
	project := chi.URLParam(r, "project")
	stackName := chi.URLParam(r, "stack")

	stack, err := h.stacks.GetStack(r.Context(), org, project, stackName)
	if err != nil {
		encode.WriteError(w, http.StatusInternalServerError, "Internal Server Error")
		return
	}

	if stack == nil {
		encode.WriteError(w, http.StatusNotFound, "Not Found")
		return
	}

	encode.WriteJSON(w, http.StatusOK, stackToResponse(stack))
}

func (h *StackHandler) DeleteStack(w http.ResponseWriter, r *http.Request) {
	org := chi.URLParam(r, "org")
	project := chi.URLParam(r, "project")
	stackName := chi.URLParam(r, "stack")

	force := false
	if rawForce := r.URL.Query().Get("force"); rawForce != "" {
		parsedForce, err := strconv.ParseBool(rawForce)
		if err != nil {
			encode.WriteError(w, http.StatusBadRequest, "Bad Request: invalid force query parameter")
			return
		}
		force = parsedForce
	}

	err := h.stacks.DeleteStack(r.Context(), org, project, stackName, force)
	if err != nil {
		switch {
		case errors.Is(err, stacks.ErrStackHasResources):
			encode.WriteError(w, http.StatusBadRequest, "Bad Request: Stack still contains resources.")
		case errors.Is(err, stacks.ErrStackNotFound):
			encode.WriteError(w, http.StatusNotFound, "Not Found")
		default:
			encode.WriteError(w, http.StatusInternalServerError, "Internal Server Error")
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *StackHandler) ListStacks(w http.ResponseWriter, r *http.Request) {
	org := r.URL.Query().Get("organization")
	if org == "" {
		caller, ok := auth.CallerFromContext(r.Context())
		if !ok || caller == nil || caller.OrgLogin == "" {
			encode.WriteError(w, http.StatusBadRequest, "Bad Request: organization query parameter is required")
			return
		}
		org = caller.OrgLogin
	}

	var continuationToken *string
	if t := r.URL.Query().Get("continuationToken"); t != "" {
		continuationToken = &t
	}

	resp, err := h.stacks.ListStacks(r.Context(), org, continuationToken, r.URL.Query().Get("tagFilter"))
	if err != nil {
		encode.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	encode.WriteJSON(w, http.StatusOK, resp)
}

func (h *StackHandler) ProjectExists(w http.ResponseWriter, r *http.Request) {
	org := chi.URLParam(r, "org")
	project := chi.URLParam(r, "project")

	exists, err := h.stacks.ProjectExists(r.Context(), org, project)
	if err != nil {
		encode.WriteError(w, http.StatusInternalServerError, "Internal Server Error")
		return
	}

	if !exists {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func stackToResponse(stack *apitype.Stack) stackResponse {
	resp := stackResponse{
		ID:               stack.ID,
		OrgName:          stack.OrgName,
		ProjectName:      stack.ProjectName,
		StackName:        string(stack.StackName),
		CurrentOperation: stack.CurrentOperation,
		ActiveUpdate:     stack.ActiveUpdate,
		Tags:             make(map[string]string, len(stack.Tags)),
		Version:          stack.Version,
	}

	for k, v := range stack.Tags {
		resp.Tags[k] = v
	}

	return resp
}

func stackTagsToMap(tags map[apitype.StackTagName]string) map[string]string {
	if len(tags) == 0 {
		return map[string]string{}
	}

	mapped := make(map[string]string, len(tags))
	for k, v := range tags {
		mapped[k] = v
	}

	return mapped
}
