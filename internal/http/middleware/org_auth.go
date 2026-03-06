package middleware

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/strata-iac/strata/internal/auth"
	"github.com/strata-iac/strata/internal/http/encode"
)

// OrgAuth returns middleware that verifies the authenticated caller has
// membership in the organization specified by the {org} URL parameter.
// The minimum required role is derived from the HTTP method:
//
//	GET, HEAD   → RoleViewer
//	DELETE      → RoleAdmin
//	POST, PATCH → RoleMember (default)
//
// Routes without an {org} URL parameter are passed through unmodified.
func OrgAuth() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			org := chi.URLParam(r, "org")
			if org == "" {
				next.ServeHTTP(w, r)
				return
			}

			caller, ok := auth.CallerFromContext(r.Context())
			if !ok || caller == nil {
				encode.WriteError(w, http.StatusUnauthorized, "Unauthorized")
				return
			}

			required := roleForMethod(r.Method)
			if !caller.HasOrgRole(org, required) {
				encode.WriteError(w, http.StatusForbidden,
					"Forbidden: insufficient permissions for organization "+org)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// roleForMethod maps HTTP methods to the minimum org role required.
func roleForMethod(method string) auth.Role {
	switch method {
	case http.MethodGet, http.MethodHead:
		return auth.RoleViewer
	case http.MethodDelete:
		return auth.RoleAdmin
	default:
		return auth.RoleMember
	}
}
