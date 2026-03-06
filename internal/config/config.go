package config

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
)

type Config struct {
	ListenAddr       string
	DatabaseURL      string
	BlobBackend      string
	BlobLocalPath    string
	BlobS3Bucket     string
	BlobS3Endpoint   string
	AuthMode         string
	DescopeProjectID string
	DevAuthToken     string
	DevUserLogin     string
	DevOrgLogin      string
	EncryptionKey    []byte
}

func Load() (*Config, error) {
	cfg := &Config{
		ListenAddr:       getEnvDefault("STRATA_LISTEN_ADDR", ":8080"),
		DatabaseURL:      os.Getenv("STRATA_DATABASE_URL"),
		BlobBackend:      getEnvDefault("STRATA_BLOB_BACKEND", "local"),
		BlobLocalPath:    getEnvDefault("STRATA_BLOB_LOCAL_PATH", "./data/blobs"),
		BlobS3Bucket:     os.Getenv("STRATA_BLOB_S3_BUCKET"),
		BlobS3Endpoint:   os.Getenv("STRATA_BLOB_S3_ENDPOINT"),
		AuthMode:         getEnvDefault("STRATA_AUTH_MODE", "dev"),
		DescopeProjectID: os.Getenv("STRATA_DESCOPE_PROJECT_ID"),
		DevAuthToken:     os.Getenv("STRATA_DEV_AUTH_TOKEN"),
		DevUserLogin:     getEnvDefault("STRATA_DEV_USER_LOGIN", "dev-user"),
		DevOrgLogin:      getEnvDefault("STRATA_DEV_ORG_LOGIN", "dev-org"),
	}

	if err := cfg.validate(); err != nil {
		return nil, err
	}

	if err := cfg.loadEncryptionKey(); err != nil {
		return nil, err
	}

	return cfg, nil
}

func (c *Config) validate() error {
	if c.ListenAddr == "" {
		return errors.New("STRATA_LISTEN_ADDR must not be empty")
	}

	if c.DatabaseURL == "" {
		return errors.New("STRATA_DATABASE_URL is required")
	}

	if c.BlobBackend != "local" && c.BlobBackend != "s3" {
		return fmt.Errorf("invalid STRATA_BLOB_BACKEND %q: expected local or s3", c.BlobBackend)
	}

	if c.BlobBackend == "local" && c.BlobLocalPath == "" {
		return errors.New("STRATA_BLOB_LOCAL_PATH is required when STRATA_BLOB_BACKEND=local")
	}

	if c.BlobBackend == "s3" && c.BlobS3Bucket == "" {
		return errors.New("STRATA_BLOB_S3_BUCKET is required when STRATA_BLOB_BACKEND=s3")
	}

	if c.AuthMode != "dev" && c.AuthMode != "descope" {
		return fmt.Errorf("invalid STRATA_AUTH_MODE %q: expected dev or descope", c.AuthMode)
	}

	if c.AuthMode == "descope" && c.DescopeProjectID == "" {
		return errors.New("STRATA_DESCOPE_PROJECT_ID is required when STRATA_AUTH_MODE=descope")
	}

	if c.AuthMode == "dev" && c.DevAuthToken == "" {
		return errors.New("STRATA_DEV_AUTH_TOKEN is required when STRATA_AUTH_MODE=dev")
	}

	if c.DevUserLogin == "" {
		return errors.New("STRATA_DEV_USER_LOGIN must not be empty")
	}

	if c.DevOrgLogin == "" {
		return errors.New("STRATA_DEV_ORG_LOGIN must not be empty")
	}

	return nil
}

func (c *Config) loadEncryptionKey() error {
	encKeyHex := os.Getenv("STRATA_ENCRYPTION_KEY")
	if encKeyHex != "" {
		key, err := hex.DecodeString(encKeyHex)
		if err != nil || len(key) != 32 {
			return fmt.Errorf("STRATA_ENCRYPTION_KEY must be 64 hex characters (32 bytes), got %d chars", len(encKeyHex))
		}
		c.EncryptionKey = key
		return nil
	}

	if c.AuthMode == "dev" {
		// Deterministic dev key for convenience — NOT production-safe.
		h := sha256.Sum256([]byte("strata-dev-encryption-key"))
		c.EncryptionKey = h[:]
	}

	return nil
}

func getEnvDefault(key, fallback string) string {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}

	return v
}
