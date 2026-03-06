package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/pulumi/pulumi/sdk/v3/go/common/apitype"

	"github.com/strata-iac/strata/internal/crypto"
	"github.com/strata-iac/strata/internal/http/encode"
)

type CryptoHandler struct {
	crypto crypto.Service
}

func NewCryptoHandler(svc crypto.Service) *CryptoHandler {
	return &CryptoHandler{crypto: svc}
}

func (h *CryptoHandler) Encrypt(w http.ResponseWriter, r *http.Request) {
	org := chi.URLParam(r, "org")
	project := chi.URLParam(r, "project")
	stack := chi.URLParam(r, "stack")
	stackFQN := fmt.Sprintf("%s/%s/%s", org, project, stack)

	var req apitype.EncryptValueRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		encode.WriteError(w, http.StatusBadRequest, "Bad Request: invalid JSON body")
		return
	}

	ciphertext, err := h.crypto.Encrypt(r.Context(), stackFQN, req.Plaintext)
	if err != nil {
		encode.WriteError(w, http.StatusInternalServerError, "Internal Server Error")
		return
	}

	encode.WriteJSON(w, http.StatusOK, apitype.EncryptValueResponse{Ciphertext: ciphertext})
}

func (h *CryptoHandler) Decrypt(w http.ResponseWriter, r *http.Request) {
	org := chi.URLParam(r, "org")
	project := chi.URLParam(r, "project")
	stack := chi.URLParam(r, "stack")
	stackFQN := fmt.Sprintf("%s/%s/%s", org, project, stack)

	var req apitype.DecryptValueRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		encode.WriteError(w, http.StatusBadRequest, "Bad Request: invalid JSON body")
		return
	}

	plaintext, err := h.crypto.Decrypt(r.Context(), stackFQN, req.Ciphertext)
	if err != nil {
		if errors.Is(err, crypto.ErrDecryptFailed) {
			encode.WriteError(w, http.StatusBadRequest, "Bad Request: decryption failed")
			return
		}
		encode.WriteError(w, http.StatusInternalServerError, "Internal Server Error")
		return
	}

	encode.WriteJSON(w, http.StatusOK, apitype.DecryptValueResponse{Plaintext: plaintext})
}
