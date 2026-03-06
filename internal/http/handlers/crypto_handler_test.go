package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/pulumi/pulumi/sdk/v3/go/common/apitype"

	"github.com/strata-iac/strata/internal/crypto"
)

type mockCryptoService struct {
	encryptFn func(ctx context.Context, stackFQN string, plaintext []byte) ([]byte, error)
	decryptFn func(ctx context.Context, stackFQN string, ciphertext []byte) ([]byte, error)
}

func (m *mockCryptoService) Encrypt(ctx context.Context, stackFQN string, plaintext []byte) ([]byte, error) {
	return m.encryptFn(ctx, stackFQN, plaintext)
}

func (m *mockCryptoService) Decrypt(ctx context.Context, stackFQN string, ciphertext []byte) ([]byte, error) {
	return m.decryptFn(ctx, stackFQN, ciphertext)
}

func newCryptoTestRouter(svc crypto.Service) *chi.Mux {
	h := NewCryptoHandler(svc)
	r := chi.NewRouter()
	r.Post("/api/stacks/{org}/{project}/{stack}/encrypt", h.Encrypt)
	r.Post("/api/stacks/{org}/{project}/{stack}/decrypt", h.Decrypt)
	return r
}

func TestEncrypt_Success(t *testing.T) {
	svc := &mockCryptoService{
		encryptFn: func(_ context.Context, stackFQN string, plaintext []byte) ([]byte, error) {
			if stackFQN != "test-org/test-project/dev" {
				t.Errorf("expected FQN test-org/test-project/dev, got %s", stackFQN)
			}
			if string(plaintext) != "my secret" {
				t.Errorf("expected plaintext 'my secret', got %q", plaintext)
			}
			return []byte("encrypted-value"), nil
		},
	}

	body, _ := json.Marshal(apitype.EncryptValueRequest{Plaintext: []byte("my secret")})
	req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/api/stacks/test-org/test-project/dev/encrypt", bytes.NewReader(body))
	rr := httptest.NewRecorder()

	newCryptoTestRouter(svc).ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	var resp apitype.EncryptValueResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if string(resp.Ciphertext) != "encrypted-value" {
		t.Errorf("expected ciphertext 'encrypted-value', got %q", resp.Ciphertext)
	}
}

func TestEncrypt_BadJSON(t *testing.T) {
	svc := &mockCryptoService{}
	req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/api/stacks/test-org/test-project/dev/encrypt", bytes.NewReader([]byte("bad json")))
	rr := httptest.NewRecorder()

	newCryptoTestRouter(svc).ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rr.Code, rr.Body.String())
	}
}

func TestDecrypt_Success(t *testing.T) {
	svc := &mockCryptoService{
		decryptFn: func(_ context.Context, stackFQN string, _ []byte) ([]byte, error) {
			if stackFQN != "test-org/test-project/dev" {
				t.Errorf("expected FQN test-org/test-project/dev, got %s", stackFQN)
			}
			return []byte("decrypted-value"), nil
		},
	}

	body, _ := json.Marshal(apitype.DecryptValueRequest{Ciphertext: []byte("some-cipher")})
	req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/api/stacks/test-org/test-project/dev/decrypt", bytes.NewReader(body))
	rr := httptest.NewRecorder()

	newCryptoTestRouter(svc).ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	var resp apitype.DecryptValueResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if string(resp.Plaintext) != "decrypted-value" {
		t.Errorf("expected plaintext 'decrypted-value', got %q", resp.Plaintext)
	}
}

func TestDecrypt_BadJSON(t *testing.T) {
	svc := &mockCryptoService{}
	req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/api/stacks/test-org/test-project/dev/decrypt", bytes.NewReader([]byte("bad")))
	rr := httptest.NewRecorder()

	newCryptoTestRouter(svc).ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rr.Code, rr.Body.String())
	}
}

func TestDecrypt_DecryptionFailed(t *testing.T) {
	svc := &mockCryptoService{
		decryptFn: func(context.Context, string, []byte) ([]byte, error) {
			return nil, crypto.ErrDecryptFailed
		},
	}

	body, _ := json.Marshal(apitype.DecryptValueRequest{Ciphertext: []byte("invalid")})
	req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/api/stacks/test-org/test-project/dev/decrypt", bytes.NewReader(body))
	rr := httptest.NewRecorder()

	newCryptoTestRouter(svc).ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rr.Code, rr.Body.String())
	}
}

func TestDecrypt_InternalError(t *testing.T) {
	svc := &mockCryptoService{
		decryptFn: func(context.Context, string, []byte) ([]byte, error) {
			return nil, errors.New("internal failure")
		},
	}

	body, _ := json.Marshal(apitype.DecryptValueRequest{Ciphertext: []byte("data")})
	req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/api/stacks/test-org/test-project/dev/decrypt", bytes.NewReader(body))
	rr := httptest.NewRecorder()

	newCryptoTestRouter(svc).ServeHTTP(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rr.Code, rr.Body.String())
	}
}
