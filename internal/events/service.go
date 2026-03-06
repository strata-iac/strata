package events

import "context"

type Service interface {
	Publish(ctx context.Context, topic string, payload []byte) error
}
