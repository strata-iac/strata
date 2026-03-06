package http

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"
)

type Server struct {
	server *http.Server
	logger *slog.Logger
	errCh  chan error
	once   sync.Once
}

func NewServer(addr string, handler http.Handler, logger *slog.Logger) *Server {
	return &Server{
		server: &http.Server{
			Addr:              addr,
			Handler:           handler,
			ReadHeaderTimeout: 10 * time.Second,
		},
		logger: logger,
		errCh:  make(chan error, 1),
	}
}

func (s *Server) Start() error {
	if s.server == nil {
		return fmt.Errorf("http server is not initialized")
	}

	go func() {
		if s.logger != nil {
			s.logger.Info("http server starting", "addr", s.server.Addr)
		}

		err := s.server.ListenAndServe()
		s.once.Do(func() {
			s.errCh <- err
			close(s.errCh)
		})
	}()

	return nil
}

func (s *Server) Shutdown(ctx context.Context) error {
	if s.server == nil {
		return nil
	}

	if s.logger != nil {
		s.logger.Info("http server shutting down", "addr", s.server.Addr)
	}

	if err := s.server.Shutdown(ctx); err != nil {
		return fmt.Errorf("http shutdown: %w", err)
	}

	return nil
}

func (s *Server) Err() <-chan error {
	return s.errCh
}
