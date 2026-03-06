package updates

import "context"

type Service interface {
	Start(ctx context.Context, org, project, stack string) error
}
