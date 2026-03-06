package middleware

import (
	"net/http"
	"strings"

	"github.com/strata-iac/strata/internal/http/encode"
)

func PulumiAccept(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			accept := r.Header.Get("Accept")
			if !strings.Contains(accept, "application/vnd.pulumi") {
				encode.WriteError(w, http.StatusNotAcceptable, "Not Acceptable: missing Accept: application/vnd.pulumi+N header")
				return
			}
		}

		next.ServeHTTP(w, r)
	})
}
