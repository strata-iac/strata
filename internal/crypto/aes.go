package crypto

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"

	"golang.org/x/crypto/hkdf"
)

const (
	keyLen   = 32 // AES-256
	nonceLen = 12 // GCM standard nonce
)

var ErrDecryptFailed = errors.New("decryption failed")

type AESService struct {
	masterKey []byte
}

func NewAESService(masterKey []byte) (*AESService, error) {
	if len(masterKey) != keyLen {
		return nil, fmt.Errorf("encryption key must be %d bytes, got %d", keyLen, len(masterKey))
	}
	return &AESService{masterKey: masterKey}, nil
}

func (s *AESService) Encrypt(_ context.Context, stackFQN string, plaintext []byte) ([]byte, error) {
	key, err := s.deriveKey(stackFQN)
	if err != nil {
		return nil, fmt.Errorf("derive key: %w", err)
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("create GCM: %w", err)
	}

	nonce := make([]byte, nonceLen)
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("generate nonce: %w", err)
	}

	// nonce || ciphertext+tag
	sealed := gcm.Seal(nonce, nonce, plaintext, nil)
	return sealed, nil
}

func (s *AESService) Decrypt(_ context.Context, stackFQN string, ciphertext []byte) ([]byte, error) {
	if len(ciphertext) < nonceLen+1 {
		return nil, ErrDecryptFailed
	}

	key, err := s.deriveKey(stackFQN)
	if err != nil {
		return nil, fmt.Errorf("derive key: %w", err)
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("create GCM: %w", err)
	}

	nonce := ciphertext[:nonceLen]
	sealed := ciphertext[nonceLen:]

	plaintext, err := gcm.Open(nil, nonce, sealed, nil)
	if err != nil {
		return nil, ErrDecryptFailed
	}

	return plaintext, nil
}

func (s *AESService) deriveKey(stackFQN string) ([]byte, error) {
	hkdfReader := hkdf.New(sha256.New, s.masterKey, []byte(stackFQN), []byte("strata-encrypt"))
	key := make([]byte, keyLen)
	if _, err := io.ReadFull(hkdfReader, key); err != nil {
		return nil, fmt.Errorf("HKDF expand: %w", err)
	}
	return key, nil
}
