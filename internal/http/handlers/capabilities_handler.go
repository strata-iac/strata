package handlers

import (
	"net/http"

	"github.com/strata-iac/strata/internal/http/encode"
)

type capabilitiesResponse struct {
	Capabilities []interface{} `json:"capabilities"`
}

func Capabilities(w http.ResponseWriter, _ *http.Request) {
	encode.WriteJSON(w, http.StatusOK, capabilitiesResponse{
		Capabilities: []interface{}{},
	})
}
