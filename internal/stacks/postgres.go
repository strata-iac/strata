package stacks

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pulumi/pulumi/sdk/v3/go/common/apitype"
	"github.com/pulumi/pulumi/sdk/v3/go/common/tokens"

	"github.com/strata-iac/strata/internal/auth"
)

const listStacksPageSize = 100

type PostgresService struct {
	db *pgxpool.Pool
}

func NewPostgresService(db *pgxpool.Pool) *PostgresService {
	return &PostgresService{db: db}
}

func (s *PostgresService) CreateStack(ctx context.Context, org, project, stackName string, tags map[string]string) (*apitype.Stack, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("stacks postgres service is not configured")
	}

	orgLogin := strings.TrimSpace(org)
	orgDisplayName := orgLogin
	if caller, ok := auth.CallerFromContext(ctx); ok && caller != nil {
		if orgLogin == "" {
			orgLogin = strings.TrimSpace(caller.OrgLogin)
		}
		if orgLogin == strings.TrimSpace(caller.OrgLogin) && strings.TrimSpace(caller.DisplayName) != "" {
			orgDisplayName = strings.TrimSpace(caller.DisplayName)
		}
	}

	if orgLogin == "" || project == "" || stackName == "" {
		return nil, fmt.Errorf("org, project, and stack name are required")
	}

	fqn := fmt.Sprintf("%s/%s/%s", orgLogin, project, stackName)

	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin create stack transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `
		INSERT INTO organizations (github_login, display_name)
		VALUES ($1, $2)
		ON CONFLICT (github_login) DO NOTHING
	`, orgLogin, orgDisplayName); err != nil {
		return nil, fmt.Errorf("ensure organization exists: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO projects (organization_id, name)
		SELECT o.id, $2
		FROM organizations o
		WHERE o.github_login = $1
		ON CONFLICT (organization_id, name) DO NOTHING
	`, orgLogin, project); err != nil {
		return nil, fmt.Errorf("ensure project exists: %w", err)
	}

	var id string
	var dbTags map[string]string
	err = tx.QueryRow(ctx, `
		INSERT INTO stacks (project_id, name, fully_qualified_name, tags)
		SELECT p.id, $3, $4, $5::jsonb
		FROM projects p
		JOIN organizations o ON o.id = p.organization_id
		WHERE o.github_login = $1 AND p.name = $2
		RETURNING id::text, tags
	`, orgLogin, project, stackName, fqn, mapToStringString(tags)).Scan(&id, &dbTags)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, ErrStackAlreadyExists
		}

		return nil, fmt.Errorf("insert stack: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit create stack transaction: %w", err)
	}

	return &apitype.Stack{
		ID:               id,
		OrgName:          orgLogin,
		ProjectName:      project,
		StackName:        tokens.QName(stackName),
		CurrentOperation: nil,
		ActiveUpdate:     "",
		Tags:             mapToStackTags(dbTags),
		Version:          0,
	}, nil
}

func (s *PostgresService) GetStack(ctx context.Context, org, project, stack string) (*apitype.Stack, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("stacks postgres service is not configured")
	}

	var id string
	var tags map[string]string
	err := s.db.QueryRow(ctx, `
		SELECT s.id::text, s.tags
		FROM stacks s
		JOIN projects p ON p.id = s.project_id
		JOIN organizations o ON o.id = p.organization_id
		WHERE o.github_login = $1 AND p.name = $2 AND s.name = $3
	`, org, project, stack).Scan(&id, &tags)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}

		return nil, fmt.Errorf("get stack: %w", err)
	}

	return &apitype.Stack{
		ID:               id,
		OrgName:          org,
		ProjectName:      project,
		StackName:        tokens.QName(stack),
		CurrentOperation: nil,
		ActiveUpdate:     "",
		Tags:             mapToStackTags(tags),
		Version:          0,
	}, nil
}

func (s *PostgresService) DeleteStack(ctx context.Context, org, project, stack string, force bool) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("stacks postgres service is not configured")
	}

	var stackID string
	var lastCheckpointVersion int64
	err := s.db.QueryRow(ctx, `
		SELECT s.id::text, s.last_checkpoint_version
		FROM stacks s
		JOIN projects p ON p.id = s.project_id
		JOIN organizations o ON o.id = p.organization_id
		WHERE o.github_login = $1 AND p.name = $2 AND s.name = $3
	`, org, project, stack).Scan(&stackID, &lastCheckpointVersion)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrStackNotFound
		}

		return fmt.Errorf("find stack to delete: %w", err)
	}

	if lastCheckpointVersion > 0 && !force {
		return ErrStackHasResources
	}

	ct, err := s.db.Exec(ctx, `DELETE FROM stacks WHERE id = $1`, stackID)
	if err != nil {
		return fmt.Errorf("delete stack: %w", err)
	}

	if ct.RowsAffected() == 0 {
		return ErrStackNotFound
	}

	return nil
}

func (s *PostgresService) ListStacks(ctx context.Context, org string, continuationToken *string, tagFilter string) (*apitype.ListStacksResponse, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("stacks postgres service is not configured")
	}

	offset, err := decodeContinuationToken(continuationToken)
	if err != nil {
		return nil, err
	}

	filterKey, filterValue, hasValue := parseTagFilter(tagFilter)

	args := []any{org, listStacksPageSize + 1, offset}
	query := `
		SELECT s.id::text, o.github_login, p.name, s.name
		FROM stacks s
		JOIN projects p ON p.id = s.project_id
		JOIN organizations o ON o.id = p.organization_id
		WHERE o.github_login = $1
	`

	if filterKey != "" {
		if hasValue {
			query += " AND s.tags ->> $4 = $5"
			args = append(args, filterKey, filterValue)
		} else {
			query += " AND s.tags ? $4"
			args = append(args, filterKey)
		}
	}

	query += " ORDER BY s.created_at ASC, s.id ASC LIMIT $2 OFFSET $3"

	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list stacks: %w", err)
	}
	defer rows.Close()

	stackSummaries := make([]apitype.StackSummary, 0, listStacksPageSize)
	for rows.Next() {
		var summary apitype.StackSummary
		if err := rows.Scan(&summary.ID, &summary.OrgName, &summary.ProjectName, &summary.StackName); err != nil {
			return nil, fmt.Errorf("scan stack summary: %w", err)
		}

		stackSummaries = append(stackSummaries, summary)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate stack summaries: %w", err)
	}

	resp := &apitype.ListStacksResponse{}
	if len(stackSummaries) > listStacksPageSize {
		trimmed := stackSummaries[:listStacksPageSize]
		resp.Stacks = trimmed
		nextOffset := offset + listStacksPageSize
		token := encodeContinuationToken(nextOffset)
		resp.ContinuationToken = &token
		return resp, nil
	}

	resp.Stacks = stackSummaries
	resp.ContinuationToken = nil
	return resp, nil
}

func (s *PostgresService) ProjectExists(ctx context.Context, org, project string) (bool, error) {
	if s == nil || s.db == nil {
		return false, fmt.Errorf("stacks postgres service is not configured")
	}

	var exists bool
	err := s.db.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1
			FROM projects p
			JOIN organizations o ON o.id = p.organization_id
			WHERE o.github_login = $1 AND p.name = $2
		)
	`, org, project).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("check project existence: %w", err)
	}

	return exists, nil
}

func mapToStackTags(tags map[string]string) map[apitype.StackTagName]string {
	if len(tags) == 0 {
		return map[apitype.StackTagName]string{}
	}

	converted := make(map[apitype.StackTagName]string, len(tags))
	for k, v := range tags {
		converted[k] = v
	}

	return converted
}

func mapToStringString(tags map[string]string) map[string]string {
	if len(tags) == 0 {
		return map[string]string{}
	}

	copied := make(map[string]string, len(tags))
	for k, v := range tags {
		copied[k] = v
	}

	return copied
}

func parseTagFilter(tagFilter string) (key, value string, hasValue bool) {
	tagFilter = strings.TrimSpace(tagFilter)
	if tagFilter == "" {
		return "", "", false
	}

	if strings.Contains(tagFilter, "=") {
		parts := strings.SplitN(tagFilter, "=", 2)
		return strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1]), true
	}

	return tagFilter, "", false
}

func decodeContinuationToken(token *string) (int, error) {
	if token == nil || *token == "" {
		return 0, nil
	}

	decoded, err := base64.StdEncoding.DecodeString(*token)
	if err != nil {
		return 0, fmt.Errorf("invalid continuation token")
	}

	offset, err := strconv.Atoi(string(decoded))
	if err != nil || offset < 0 {
		return 0, fmt.Errorf("invalid continuation token")
	}

	return offset, nil
}

func encodeContinuationToken(offset int) string {
	return base64.StdEncoding.EncodeToString([]byte(strconv.Itoa(offset)))
}
