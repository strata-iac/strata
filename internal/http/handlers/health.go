package handlers

import (
	"net/http"

	"github.com/strata-iac/strata/internal/http/encode"
)

func Healthz(w http.ResponseWriter, _ *http.Request) {
	encode.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
