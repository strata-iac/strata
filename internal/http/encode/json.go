package encode

import (
	"encoding/json"
	"net/http"

	"github.com/pulumi/pulumi/sdk/v3/go/common/apitype"
)

func WriteJSON(w http.ResponseWriter, statusCode int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)

	if err := json.NewEncoder(w).Encode(v); err != nil {
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
	}
}

func WriteError(w http.ResponseWriter, httpCode int, msg string) {
	resp := apitype.ErrorResponse{
		Code:    httpCode,
		Message: msg,
	}

	WriteJSON(w, httpCode, resp)
}
