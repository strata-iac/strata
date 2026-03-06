package crypto

import "context"

type NopService struct{}

func NewNopService() *NopService {
	return &NopService{}
}

func (s *NopService) Encrypt(_ context.Context, plaintext []byte) ([]byte, error) {
	return plaintext, nil
}

func (s *NopService) Decrypt(_ context.Context, ciphertext []byte) ([]byte, error) {
	return ciphertext, nil
}
