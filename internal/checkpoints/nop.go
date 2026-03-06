package checkpoints

import (
	"context"
	"io"
)

type NopService struct{}

func NewNopService() *NopService {
	return &NopService{}
}

func (s *NopService) Store(_ context.Context, _ string, _ io.Reader) error {
	return nil
}
