package stacks

import (
	"context"

	"github.com/pulumi/pulumi/sdk/v3/go/common/apitype"
)

type Service interface {
	CreateStack(ctx context.Context, org, project, stackName string, tags map[string]string) (*apitype.Stack, error)
	GetStack(ctx context.Context, org, project, stack string) (*apitype.Stack, error)
	DeleteStack(ctx context.Context, org, project, stack string, force bool) error
	ListStacks(ctx context.Context, org string, continuationToken *string, tagFilter string) (*apitype.ListStacksResponse, error)
	ProjectExists(ctx context.Context, org, project string) (bool, error)
	RenameStack(ctx context.Context, org, project, stack, newName, newProject string) error
}
