package stacks

import (
	"context"

	"github.com/pulumi/pulumi/sdk/v3/go/common/apitype"
	"github.com/pulumi/pulumi/sdk/v3/go/common/tokens"
)

type NopService struct{}

func NewNopService() *NopService {
	return &NopService{}
}

func (s *NopService) CreateStack(_ context.Context, org, project, stackName string, tags map[string]string) (*apitype.Stack, error) {
	return &apitype.Stack{
		ID:          "",
		OrgName:     org,
		ProjectName: project,
		StackName:   tokens.QName(stackName),
		Tags:        cloneTags(tags),
		Version:     0,
	}, nil
}

func (s *NopService) GetStack(_ context.Context, _, _, _ string) (*apitype.Stack, error) {
	return nil, nil
}

func (s *NopService) DeleteStack(_ context.Context, _, _, _ string, _ bool) error {
	return nil
}

func (s *NopService) ListStacks(_ context.Context, _ string, _ *string, _ string) (*apitype.ListStacksResponse, error) {
	return &apitype.ListStacksResponse{
		Stacks: []apitype.StackSummary{},
	}, nil
}

func (s *NopService) ProjectExists(_ context.Context, _, _ string) (bool, error) {
	return false, nil
}

func (s *NopService) RenameStack(_ context.Context, _, _, _, _, _ string) error {
	return nil
}

func cloneTags(tags map[string]string) map[string]string {
	if len(tags) == 0 {
		return map[string]string{}
	}

	cloned := make(map[string]string, len(tags))
	for k, v := range tags {
		cloned[k] = v
	}

	return cloned
}
