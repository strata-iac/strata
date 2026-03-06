package app

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/strata-iac/strata/internal/auth"
	"github.com/strata-iac/strata/internal/checkpoints"
	"github.com/strata-iac/strata/internal/config"
	"github.com/strata-iac/strata/internal/crypto"
	"github.com/strata-iac/strata/internal/events"
	httpserver "github.com/strata-iac/strata/internal/http"
	"github.com/strata-iac/strata/internal/stacks"
	"github.com/strata-iac/strata/internal/storage/blobs"
	"github.com/strata-iac/strata/internal/updates"
)

type App struct {
	cfg           *config.Config
	logger        *slog.Logger
	db            *pgxpool.Pool
	authenticator auth.Authenticator
	stacks        stacks.Service
	updates       updates.Service
	checkpoints   checkpoints.Service
	events        events.Service
	crypto        crypto.Service
	blobStore     blobs.BlobStore
	server        *httpserver.Server
}

type Services struct {
	Authenticator auth.Authenticator
	Stacks        stacks.Service
	Updates       updates.Service
	Checkpoints   checkpoints.Service
	Events        events.Service
	Crypto        crypto.Service
	BlobStore     blobs.BlobStore
}

func New(cfg *config.Config, logger *slog.Logger, db *pgxpool.Pool, services Services, server *httpserver.Server) *App {
	return &App{
		cfg:           cfg,
		logger:        logger,
		db:            db,
		authenticator: services.Authenticator,
		stacks:        services.Stacks,
		updates:       services.Updates,
		checkpoints:   services.Checkpoints,
		events:        services.Events,
		crypto:        services.Crypto,
		blobStore:     services.BlobStore,
		server:        server,
	}
}

func (a *App) Start(_ context.Context) error {
	if a.server == nil {
		return fmt.Errorf("server is required")
	}

	if a.db == nil {
		return fmt.Errorf("database is required")
	}

	if a.authenticator == nil {
		return fmt.Errorf("authenticator is required")
	}

	if err := a.server.Start(); err != nil {
		return fmt.Errorf("start server: %w", err)
	}

	return nil
}

func (a *App) Stop(ctx context.Context) error {
	if a.server != nil {
		if err := a.server.Shutdown(ctx); err != nil {
			return fmt.Errorf("shutdown server: %w", err)
		}
	}

	if a.db != nil {
		a.db.Close()
	}

	return nil
}
