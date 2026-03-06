package config

import (
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

	if cfg.ListenAddr == "" {
		return nil, errors.New("STRATA_LISTEN_ADDR must not be empty")
	}

	if cfg.DatabaseURL == "" {
		return nil, errors.New("STRATA_DATABASE_URL is required")
	}

	if cfg.BlobBackend != "local" && cfg.BlobBackend != "s3" {
		return nil, fmt.Errorf("invalid STRATA_BLOB_BACKEND %q: expected local or s3", cfg.BlobBackend)
	}

	if cfg.BlobBackend == "local" && cfg.BlobLocalPath == "" {
		return nil, errors.New("STRATA_BLOB_LOCAL_PATH is required when STRATA_BLOB_BACKEND=local")
	}

	if cfg.BlobBackend == "s3" && cfg.BlobS3Bucket == "" {
		return nil, errors.New("STRATA_BLOB_S3_BUCKET is required when STRATA_BLOB_BACKEND=s3")
	}

	if cfg.AuthMode != "dev" && cfg.AuthMode != "descope" {
		return nil, fmt.Errorf("invalid STRATA_AUTH_MODE %q: expected dev or descope", cfg.AuthMode)
	}

	if cfg.AuthMode == "descope" && cfg.DescopeProjectID == "" {
		return nil, errors.New("STRATA_DESCOPE_PROJECT_ID is required when STRATA_AUTH_MODE=descope")
	}

	if cfg.AuthMode == "dev" && cfg.DevAuthToken == "" {
		return nil, errors.New("STRATA_DEV_AUTH_TOKEN is required when STRATA_AUTH_MODE=dev")
	}

	if cfg.DevUserLogin == "" {
		return nil, errors.New("STRATA_DEV_USER_LOGIN must not be empty")
	}

	if cfg.DevOrgLogin == "" {
		return nil, errors.New("STRATA_DEV_ORG_LOGIN must not be empty")
	}

	return cfg, nil
}

func getEnvDefault(key, fallback string) string {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}

	return v
}
