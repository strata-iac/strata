package checkpoints

import (
	"context"
	"io"
)

type Service interface {
	Store(ctx context.Context, stackID string, checkpoint io.Reader) error
}
