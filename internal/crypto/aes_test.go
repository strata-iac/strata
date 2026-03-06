package crypto

import (
	"bytes"
	"context"
	"crypto/rand"
	"testing"
)

func testKey(t *testing.T) []byte {
	t.Helper()
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		t.Fatalf("generate test key: %v", err)
	}
	return key
}

func TestAESService_RoundTrip(t *testing.T) {
	svc, err := NewAESService(testKey(t))
	if err != nil {
		t.Fatalf("new AES service: %v", err)
	}

	tests := []struct {
		name      string
		plaintext []byte
	}{
		{"simple text", []byte("hello world")},
		{"empty", []byte{}},
		{"binary data", []byte{0x00, 0x01, 0xff, 0xfe}},
		{"long text", bytes.Repeat([]byte("abcdef"), 1000)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ciphertext, err := svc.Encrypt(context.Background(), "org/project/stack", tt.plaintext)
			if err != nil {
				t.Fatalf("encrypt: %v", err)
			}

			if bytes.Equal(ciphertext, tt.plaintext) && len(tt.plaintext) > 0 {
				t.Fatal("ciphertext should differ from plaintext")
			}

			decrypted, err := svc.Decrypt(context.Background(), "org/project/stack", ciphertext)
			if err != nil {
				t.Fatalf("decrypt: %v", err)
			}

			if !bytes.Equal(decrypted, tt.plaintext) {
				t.Fatalf("expected %q, got %q", tt.plaintext, decrypted)
			}
		})
	}
}

func TestAESService_DifferentStacksDifferentCiphertext(t *testing.T) {
	svc, err := NewAESService(testKey(t))
	if err != nil {
		t.Fatalf("new AES service: %v", err)
	}

	plaintext := []byte("same secret value")
	ct1, err := svc.Encrypt(context.Background(), "org/project/stack-a", plaintext)
	if err != nil {
		t.Fatalf("encrypt stack-a: %v", err)
	}

	ct2, err := svc.Encrypt(context.Background(), "org/project/stack-b", plaintext)
	if err != nil {
		t.Fatalf("encrypt stack-b: %v", err)
	}

	if bytes.Equal(ct1, ct2) {
		t.Fatal("different stacks should produce different ciphertext")
	}
}

func TestAESService_WrongStackDecryptFails(t *testing.T) {
	svc, err := NewAESService(testKey(t))
	if err != nil {
		t.Fatalf("new AES service: %v", err)
	}

	ciphertext, err := svc.Encrypt(context.Background(), "org/project/stack-a", []byte("secret"))
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}

	_, err = svc.Decrypt(context.Background(), "org/project/stack-b", ciphertext)
	if err == nil {
		t.Fatal("expected decrypt to fail with wrong stack")
	}
}

func TestAESService_TamperedCiphertext(t *testing.T) {
	svc, err := NewAESService(testKey(t))
	if err != nil {
		t.Fatalf("new AES service: %v", err)
	}

	ciphertext, err := svc.Encrypt(context.Background(), "org/project/stack", []byte("secret"))
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}

	// Flip a byte in the ciphertext (after the nonce).
	tampered := make([]byte, len(ciphertext))
	copy(tampered, ciphertext)
	tampered[nonceLen+1] ^= 0xff

	_, err = svc.Decrypt(context.Background(), "org/project/stack", tampered)
	if err == nil {
		t.Fatal("expected decrypt to fail with tampered ciphertext")
	}
}

func TestAESService_TooShortCiphertext(t *testing.T) {
	svc, err := NewAESService(testKey(t))
	if err != nil {
		t.Fatalf("new AES service: %v", err)
	}

	_, err = svc.Decrypt(context.Background(), "org/project/stack", []byte("short"))
	if err == nil {
		t.Fatal("expected decrypt to fail with short ciphertext")
	}
}

func TestNewAESService_InvalidKeyLength(t *testing.T) {
	_, err := NewAESService([]byte("too-short"))
	if err == nil {
		t.Fatal("expected error for invalid key length")
	}
}
