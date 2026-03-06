package db

import (
	"context"
	"database/sql"
	"embed"
	"errors"
	"fmt"
	"log/slog"
	"strings"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/pgx/v5"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib" // register pgx driver for database/sql
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

func RunMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	connCfg := pool.Config().ConnConfig
	connString := connCfg.ConnString()

	sourceDriver, err := iofs.New(migrationsFS, "migrations")
	if err != nil {
		return fmt.Errorf("create iofs migration source: %w", err)
	}

	sqlDB, err := sql.Open("pgx", connString)
	if err != nil {
		return fmt.Errorf("open migration sql connection: %w", err)
	}
	defer sqlDB.Close()

	databaseDriver, err := pgx.WithInstance(sqlDB, &pgx.Config{
		DatabaseName: connCfg.Database,
		SchemaName:   schemaName(connCfg.RuntimeParams),
	})
	if err != nil {
		return fmt.Errorf("create pgx migration driver: %w", err)
	}

	m, err := migrate.NewWithInstance("iofs", sourceDriver, "pgx", databaseDriver)
	if err != nil {
		return fmt.Errorf("create migration instance: %w", err)
	}
	defer m.Close()

	slog.InfoContext(ctx, "running database migrations")
	err = m.Up()
	if err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("apply database migrations: %w", err)
	}
	slog.InfoContext(ctx, "database migrations complete")

	return nil
}

func schemaName(runtimeParams map[string]string) string {
	searchPath := runtimeParams["search_path"]
	if searchPath == "" {
		return "public"
	}

	first, _, _ := strings.Cut(searchPath, ",")
	name := strings.TrimSpace(first)
	if name == "" {
		return "public"
	}

	return name
}
