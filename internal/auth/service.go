package auth

import (
	"context"
	"crypto/subtle"
	"errors"
	"fmt"
	"strings"

	"github.com/strata-iac/strata/internal/config"
)

type Role string

const (
	RoleViewer Role = "viewer"
	RoleMember Role = "member"
	RoleAdmin  Role = "admin"
)

var roleRank = map[Role]int{
	RoleViewer: 1,
	RoleMember: 2,
	RoleAdmin:  3,
}

func (r Role) AtLeast(required Role) bool {
	return roleRank[r] >= roleRank[required]
}

type OrgRole struct {
	OrgLogin string
	Role     Role
}

type callerContextKey struct{}

func ContextWithCaller(ctx context.Context, c *Caller) context.Context {
	return context.WithValue(ctx, callerContextKey{}, c)
}

func CallerFromContext(ctx context.Context) (*Caller, bool) {
	c, ok := ctx.Value(callerContextKey{}).(*Caller)
	return c, ok
}

type Caller struct {
	UserID         string
	GithubLogin    string
	DisplayName    string
	Email          string
	OrgLogin       string
	OrgMemberships []OrgRole
}

func (c *Caller) HasOrgRole(org string, required Role) bool {
	for _, m := range c.OrgMemberships {
		if m.OrgLogin == org && m.Role.AtLeast(required) {
			return true
		}
	}
	return false
}

func (c *Caller) OrgLogins() []string {
	orgs := make([]string, len(c.OrgMemberships))
	for i, m := range c.OrgMemberships {
		orgs[i] = m.OrgLogin
	}
	return orgs
}

type Authenticator interface {
	ValidateToken(ctx context.Context, token string) (*Caller, error)
}

type devUser struct {
	token  string
	caller *Caller
}

type DevAuthenticator struct {
	users []devUser
}

func NewDevAuthenticator(cfg *config.Config) *DevAuthenticator {
	a := &DevAuthenticator{}

	a.users = append(a.users, devUser{
		token: cfg.DevAuthToken,
		caller: &Caller{
			UserID:      "dev-user-id",
			GithubLogin: cfg.DevUserLogin,
			DisplayName: cfg.DevUserLogin,
			Email:       "dev@example.local",
			OrgLogin:    cfg.DevOrgLogin,
			OrgMemberships: []OrgRole{
				{OrgLogin: cfg.DevOrgLogin, Role: RoleAdmin},
			},
		},
	})

	for i, u := range cfg.DevUsers {
		role := RoleMember
		switch Role(u.Role) {
		case RoleViewer, RoleMember, RoleAdmin:
			role = Role(u.Role)
		}

		a.users = append(a.users, devUser{
			token: u.Token,
			caller: &Caller{
				UserID:      fmt.Sprintf("dev-user-%d", i+2),
				GithubLogin: u.Login,
				DisplayName: u.Login,
				Email:       u.Login + "@example.local",
				OrgLogin:    u.Org,
				OrgMemberships: []OrgRole{
					{OrgLogin: u.Org, Role: role},
				},
			},
		})
	}

	return a
}

func (a *DevAuthenticator) ValidateToken(_ context.Context, token string) (*Caller, error) {
	if a == nil {
		return nil, errors.New("dev authenticator is not configured")
	}

	const scheme = "token "
	if !strings.HasPrefix(token, scheme) {
		return nil, fmt.Errorf("invalid authorization scheme")
	}

	provided := strings.TrimPrefix(token, scheme)

	for _, u := range a.users {
		if subtle.ConstantTimeCompare([]byte(provided), []byte(u.token)) == 1 {
			return u.caller, nil
		}
	}

	return nil, errors.New("invalid token")
}
