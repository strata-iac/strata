package crypto

import "context"

type Service interface {
	Encrypt(ctx context.Context, stackFQN string, plaintext []byte) ([]byte, error)
	Decrypt(ctx context.Context, stackFQN string, ciphertext []byte) ([]byte, error)
}
