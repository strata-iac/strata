package stacks

import "context"

type Repository interface {
	GetByName(ctx context.Context, org, project, stack string) error
}
