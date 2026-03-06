package updates

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	gcDefaultInterval = 60 * time.Second
	gcAdvisoryLockID  = 0x5472617461_4743 // "StrataGC" as int64
	gcStaleThreshold  = 1 * time.Hour
)

type GCWorker struct {
	db       *pgxpool.Pool
	logger   *slog.Logger
	interval time.Duration
	done     chan struct{}
}

func NewGCWorker(db *pgxpool.Pool, logger *slog.Logger) *GCWorker {
	return &GCWorker{
		db:       db,
		logger:   logger,
		interval: gcDefaultInterval,
		done:     make(chan struct{}),
	}
}

func (w *GCWorker) Start(ctx context.Context) {
	if _, err := w.RunOnce(ctx); err != nil {
		w.logger.Warn("gc reconciliation at startup failed", "error", err)
	}

	go w.loop() //nolint:gosec // G118: intentionally detached — GC worker runs for app lifetime, not per-request
}

func (w *GCWorker) Stop() {
	close(w.done)
}

func (w *GCWorker) loop() {
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	for {
		select {
		case <-w.done:
			return
		case <-ticker.C:
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			if n, err := w.RunOnce(ctx); err != nil {
				w.logger.Warn("gc cycle failed", "error", err)
			} else if n > 0 {
				w.logger.Info("gc canceled orphaned updates", "count", n)
			}
			cancel()
		}
	}
}

func (w *GCWorker) RunOnce(ctx context.Context) (int, error) {
	conn, err := w.db.Acquire(ctx)
	if err != nil {
		return 0, fmt.Errorf("acquire connection for gc: %w", err)
	}
	defer conn.Release()

	var locked bool
	err = conn.QueryRow(ctx, `SELECT pg_try_advisory_lock($1)`, gcAdvisoryLockID).Scan(&locked)
	if err != nil {
		return 0, fmt.Errorf("try advisory lock: %w", err)
	}
	if !locked {
		return 0, nil
	}
	defer func() {
		_, _ = conn.Exec(ctx, `SELECT pg_advisory_unlock($1)`, gcAdvisoryLockID)
	}()

	rows, err := conn.Query(ctx, `
		SELECT u.id::text, u.stack_id::text
		FROM updates u
		WHERE (u.status = 'running' AND u.lease_expires_at < now())
		   OR (u.status IN ('not started', 'requested') AND u.created_at < now() - $1::interval)
	`, gcStaleThreshold.String())
	if err != nil {
		return 0, fmt.Errorf("query orphaned updates: %w", err)
	}
	defer rows.Close()

	type orphan struct {
		updateID string
		stackID  string
	}
	var orphans []orphan
	for rows.Next() {
		var o orphan
		if err := rows.Scan(&o.updateID, &o.stackID); err != nil {
			return 0, fmt.Errorf("scan orphaned update: %w", err)
		}
		orphans = append(orphans, o)
	}
	if err := rows.Err(); err != nil {
		return 0, fmt.Errorf("iterate orphaned updates: %w", err)
	}

	canceled := 0
	for _, o := range orphans {
		ct, err := conn.Exec(ctx, `
			UPDATE updates
			SET status = 'cancelled', completed_at = now(), lease_token = NULL, lease_expires_at = NULL
			WHERE id = $1::uuid AND status IN ('not started', 'requested', 'running')
		`, o.updateID)
		if err != nil {
			w.logger.Warn("gc: failed to cancel orphan", "update_id", o.updateID, "error", err)
			continue
		}
		if ct.RowsAffected() > 0 {
			if _, err := conn.Exec(ctx, `
				UPDATE stacks SET current_operation_id = NULL, updated_at = now()
				WHERE id = $1::uuid AND current_operation_id = $2::uuid
			`, o.stackID, o.updateID); err != nil {
				w.logger.Warn("gc: failed to clear stack lock", "stack_id", o.stackID, "error", err)
			}
			w.logger.Info("gc: canceled orphaned update", "update_id", o.updateID, "stack_id", o.stackID)
			canceled++
		}
	}

	return canceled, nil
}
