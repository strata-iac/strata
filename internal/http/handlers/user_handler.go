package handlers

import (
	"net/http"

	"github.com/strata-iac/strata/internal/auth"
	"github.com/strata-iac/strata/internal/http/encode"
)

// orgResponse mirrors what the Pulumi CLI expects in the orgs array
type orgResponse struct {
	GithubLogin string `json:"githubLogin"`
	Name        string `json:"name"`
	AvatarURL   string `json:"avatarUrl"`
}

// userResponse is the EXACT shape the Pulumi CLI requires from GET /api/user.
// CRITICAL: githubLogin MUST be non-empty or CLI hard-crashes.
type userResponse struct {
	ID            string        `json:"id"`
	GithubLogin   string        `json:"githubLogin"`
	Name          string        `json:"name"`
	Email         string        `json:"email"`
	AvatarURL     string        `json:"avatarUrl"`
	Organizations []orgResponse `json:"organizations"`
	Identities    []string      `json:"identities"`
	TokenInfo     *tokenInfo    `json:"tokenInfo,omitempty"`
}

type tokenInfo struct {
	Name         string `json:"name"`
	Organization string `json:"organization"`
	Team         string `json:"team,omitempty"`
}

func DefaultOrganization(w http.ResponseWriter, r *http.Request) {
	caller, ok := auth.CallerFromContext(r.Context())
	if !ok || caller == nil {
		encode.WriteError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	encode.WriteJSON(w, http.StatusOK, struct {
		GitHubLogin string `json:"gitHubLogin"`
		Messages    []any  `json:"messages"`
	}{
		GitHubLogin: caller.OrgLogin,
		Messages:    []any{},
	})
}

func NewUserHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := auth.CallerFromContext(r.Context())
		if !ok || caller == nil {
			encode.WriteError(w, http.StatusUnauthorized, "Unauthorized")
			return
		}

		resp := userResponse{
			ID:          caller.UserID,
			GithubLogin: caller.GithubLogin,
			Name:        caller.DisplayName,
			Email:       caller.Email,
			Organizations: []orgResponse{
				{
					GithubLogin: caller.OrgLogin,
					Name:        caller.OrgLogin,
				},
			},
			Identities: []string{},
		}

		encode.WriteJSON(w, http.StatusOK, resp)
	}
}
