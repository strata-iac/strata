package crypto

import "context"

type NopService struct{}

func NewNopService() *NopService {
	return &NopService{}
}

func (s *NopService) Encrypt(_ context.Context, _ string, plaintext []byte) ([]byte, error) {
	return plaintext, nil
}

func (s *NopService) Decrypt(_ context.Context, _ string, ciphertext []byte) ([]byte, error) {
	return ciphertext, nil
}
