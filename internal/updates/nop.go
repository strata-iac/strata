package updates

import "context"

type NopService struct{}

func NewNopService() *NopService {
	return &NopService{}
}

func (s *NopService) Start(_ context.Context, _, _, _ string) error {
	return nil
}
