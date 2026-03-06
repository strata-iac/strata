package middleware

import (
	"log/slog"
	"net/http"

	"github.com/strata-iac/strata/internal/http/encode"
)

func Recovery(logger *slog.Logger) func(next http.Handler) http.Handler {
	if logger == nil {
		logger = slog.Default()
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if recovered := recover(); recovered != nil {
					logger.Error("panic recovered",
						"panic", recovered,
						"path", r.URL.Path,
						"request_id", GetRequestID(r.Context()),
					)

					encode.WriteError(w, http.StatusInternalServerError, "internal server error")
				}
			}()

			next.ServeHTTP(w, r)
		})
	}
}
