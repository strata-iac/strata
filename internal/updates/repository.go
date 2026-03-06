package updates

import "context"

type Repository interface {
	Create(ctx context.Context, updateID string) error
}
