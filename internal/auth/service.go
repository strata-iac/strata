package auth

import (
	"context"
	"crypto/subtle"
	"errors"
	"fmt"
	"strings"

	"github.com/strata-iac/strata/internal/config"
)

type callerContextKey struct{}

// ContextWithCaller returns a new context with the Caller stored.
func ContextWithCaller(ctx context.Context, c *Caller) context.Context {
	return context.WithValue(ctx, callerContextKey{}, c)
}

// CallerFromContext retrieves the Caller from the context.
func CallerFromContext(ctx context.Context) (*Caller, bool) {
	c, ok := ctx.Value(callerContextKey{}).(*Caller)
	return c, ok
}

type Caller struct {
	UserID      string
	GithubLogin string
	DisplayName string
	Email       string
	OrgLogin    string
}

type Authenticator interface {
	ValidateToken(ctx context.Context, token string) (*Caller, error)
}

type DevAuthenticator struct {
	cfg *config.Config
}

func NewDevAuthenticator(cfg *config.Config) *DevAuthenticator {
	return &DevAuthenticator{cfg: cfg}
}

func (a *DevAuthenticator) ValidateToken(_ context.Context, token string) (*Caller, error) {
	if a == nil || a.cfg == nil {
		return nil, errors.New("dev authenticator is not configured")
	}

	const scheme = "token "
	if !strings.HasPrefix(token, scheme) {
		return nil, fmt.Errorf("invalid authorization scheme")
	}

	provided := strings.TrimPrefix(token, scheme)
	if subtle.ConstantTimeCompare([]byte(provided), []byte(a.cfg.DevAuthToken)) != 1 {
		return nil, errors.New("invalid token")
	}

	caller := &Caller{
		UserID:      "dev-user-id",
		GithubLogin: a.cfg.DevUserLogin,
		DisplayName: a.cfg.DevUserLogin,
		Email:       "dev@example.local",
		OrgLogin:    a.cfg.DevOrgLogin,
	}

	if caller.GithubLogin == "" {
		return nil, errors.New("github login must not be empty")
	}

	return caller, nil
}
