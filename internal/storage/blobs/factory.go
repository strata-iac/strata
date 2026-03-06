package blobs

import (
	"context"
	"fmt"

	"github.com/strata-iac/strata/internal/config"
)

func New(ctx context.Context, cfg *config.Config) (BlobStore, error) {
	if cfg == nil {
		return nil, fmt.Errorf("config is required")
	}

	switch cfg.BlobBackend {
	case "local":
		store, err := NewLocalStore(cfg.BlobLocalPath)
		if err != nil {
			return nil, fmt.Errorf("initialize local blob store: %w", err)
		}

		return store, nil
	case "s3":
		store, err := NewS3Store(ctx, cfg.BlobS3Bucket, cfg.BlobS3Endpoint)
		if err != nil {
			return nil, fmt.Errorf("initialize s3 blob store: %w", err)
		}

		return store, nil
	default:
		return nil, fmt.Errorf("unsupported blob backend %q", cfg.BlobBackend)
	}
}
