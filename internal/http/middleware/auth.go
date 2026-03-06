package middleware

import (
	"net/http"

	"github.com/strata-iac/strata/internal/auth"
	"github.com/strata-iac/strata/internal/http/encode"
)

// Auth returns a middleware that validates the Authorization header and stores the Caller in context.
func Auth(authenticator auth.Authenticator) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				encode.WriteError(w, http.StatusUnauthorized, "Unauthorized: missing Authorization header")
				return
			}

			caller, err := authenticator.ValidateToken(r.Context(), authHeader)
			if err != nil {
				encode.WriteError(w, http.StatusUnauthorized, "Unauthorized: "+err.Error())
				return
			}

			ctx := auth.ContextWithCaller(r.Context(), caller)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
