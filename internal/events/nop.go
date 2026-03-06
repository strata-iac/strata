package events

import "context"

type NopService struct{}

func NewNopService() *NopService {
	return &NopService{}
}

func (s *NopService) Publish(_ context.Context, _ string, _ []byte) error {
	return nil
}
