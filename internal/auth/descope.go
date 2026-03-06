package auth

import (
	"context"
	"fmt"
	"strings"

	"github.com/descope/go-sdk/descope"
	"github.com/descope/go-sdk/descope/client"
)

// DescopeAuth abstracts the Descope SDK methods needed for authentication.
// This enables unit testing without a live Descope backend.
type DescopeAuth interface {
	ExchangeAccessKey(ctx context.Context, accessKey string, loginOptions *descope.AccessKeyLoginOptions) (bool, *descope.Token, error)
}

// DescopeAuthenticator validates Descope access keys and extracts tenant
// memberships from the resulting JWT claims.
type DescopeAuthenticator struct {
	auth DescopeAuth
}

// NewDescopeAuthenticator creates an authenticator backed by the Descope API.
func NewDescopeAuthenticator(projectID string) (*DescopeAuthenticator, error) {
	c, err := client.NewWithConfig(&client.Config{ProjectID: projectID})
	if err != nil {
		return nil, fmt.Errorf("create descope client: %w", err)
	}
	return &DescopeAuthenticator{auth: c.Auth}, nil
}

// NewDescopeAuthenticatorFrom creates an authenticator with a custom DescopeAuth
// implementation. Use this for testing.
func NewDescopeAuthenticatorFrom(auth DescopeAuth) *DescopeAuthenticator {
	return &DescopeAuthenticator{auth: auth}
}

// ValidateToken exchanges the access key for a JWT and builds a Caller from the
// token's tenant claims. The token parameter is the full Authorization header value
// including the "token " scheme prefix.
func (a *DescopeAuthenticator) ValidateToken(ctx context.Context, token string) (*Caller, error) {
	const scheme = "token "
	if !strings.HasPrefix(token, scheme) {
		return nil, fmt.Errorf("invalid authorization scheme")
	}

	accessKey := strings.TrimPrefix(token, scheme)
	if accessKey == "" {
		return nil, fmt.Errorf("missing access key")
	}

	ok, descopeToken, err := a.auth.ExchangeAccessKey(ctx, accessKey, nil)
	if err != nil {
		return nil, fmt.Errorf("invalid access key: %w", err)
	}

	if !ok {
		return nil, fmt.Errorf("access key validation failed")
	}

	return callerFromDescopeToken(descopeToken), nil
}

// callerFromDescopeToken maps Descope JWT claims to our internal Caller struct.
func callerFromDescopeToken(token *descope.Token) *Caller {
	login := firstNonEmpty(
		claimString(token, "email"),
		claimString(token, "name"),
		claimString(token, "sub"),
		token.ID,
		"descope-user",
	)

	name := claimString(token, "name")
	if name == "" {
		name = login
	}

	caller := &Caller{
		UserID:      token.ID,
		GithubLogin: login,
		DisplayName: name,
		Email:       claimString(token, "email"),
	}

	tenants := token.GetTenants()
	caller.OrgMemberships = make([]OrgRole, 0, len(tenants))

	for _, tenantID := range tenants {
		role := highestTenantRole(token, tenantID)
		caller.OrgMemberships = append(caller.OrgMemberships, OrgRole{
			OrgLogin: tenantID,
			Role:     role,
		})
	}

	// Set legacy OrgLogin to first tenant for backward compat.
	if len(caller.OrgMemberships) > 0 {
		caller.OrgLogin = caller.OrgMemberships[0].OrgLogin
	}

	return caller
}

// highestTenantRole reads the "roles" array from the tenant claim and returns
// the highest role found. Defaults to RoleViewer if no roles are present.
func highestTenantRole(token *descope.Token, tenantID string) Role {
	rolesAny := token.GetTenantValue(tenantID, "roles")
	roles, ok := rolesAny.([]any)
	if !ok {
		return RoleViewer
	}

	highest := RoleViewer
	for _, r := range roles {
		roleName, ok := r.(string)
		if !ok {
			continue
		}

		switch Role(roleName) {
		case RoleAdmin:
			return RoleAdmin // max rank, short-circuit
		case RoleMember:
			highest = RoleMember
		}
	}

	return highest
}

func claimString(token *descope.Token, key string) string {
	v := token.CustomClaim(key)
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}
