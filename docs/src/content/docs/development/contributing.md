---
title: Contributing
description: Prerequisites, setup, code style, and development workflow.
---

## Prerequisites

| Tool | Purpose |
|---|---|
| [mise](https://mise.jdx.dev/) | Tool version management (Go, golangci-lint, govulncheck) |
| [Docker](https://docs.docker.com/get-docker/) | Container runtime for dependencies and builds |
| [Bun](https://bun.sh/) | Web API + UI development (managed by mise) |
| [Pulumi CLI](https://www.pulumi.com/docs/install/) | Required for E2E tests |

## Setup

```bash
git clone https://github.com/strata-iac/strata.git
cd strata

# Install all tools via mise
mise install

# Start the full dev environment (postgres, minio, Go API, tRPC API, React UI, Caddy)
bun run dev
```

Dev environment variables are managed in `mise.toml` under `[env]` and automatically available via `mise exec --`. No manual export needed.

## Tool Versions

Managed by `mise.toml`:

| Tool | Version |
|---|---|
| Go | 1.26.1 |
| golangci-lint | 2.11.1 |
| govulncheck | latest |

All Go commands use `mise exec --` to ensure correct tool versions. The `package.json` scripts handle this automatically.

## Code Style

### Go

- **Formatting**: `gofumpt` + `goimports` (enforced by golangci-lint)
- **Linting**: golangci-lint v2 with gosec, govet, revive, noctx, and more
- **Design**: Accept interfaces, return structs
- **Errors**: Always wrap with context: `fmt.Errorf("failed to X: %w", err)`
- **Testing**: Table-driven tests with `-race` flag
- **Context**: Always use `context.Context` for cancellation and timeouts

### Interfaces

Service interfaces are defined where they are consumed (in the handler package), not where they are implemented. Keep interfaces small (1–3 methods when possible).

### Error Handling

```go
// Good — wrapped with context
if err != nil {
    return fmt.Errorf("failed to create stack %q: %w", name, err)
}

// Bad — no context
if err != nil {
    return err
}
```

## Bun Scripts

| Script | Description |
|---|---|
| `bun run dev` | Start full dev environment (Caddy + Air + tRPC + Vite) |
| `bun run dev:down` | Stop dev dependencies + remove volumes |
| `bun run go:build` | Build Go binary |
| `bun run go:lint` | Run Go linters |
| `bun run go:lint:fix` | Run Go linters with auto-fix |
| `bun run go:test` | Run Go unit tests with race detector |
| `bun run go:vuln` | Run vulnerability scanner |
| `bun run web:lint` | Biome lint |
| `bun run web:typecheck` | TypeScript typecheck (both apps) |
| `bun run web:test` | Run 28 web unit tests |
| `bun run web:build` | Build React SPA |
| `bun run check` | Go: lint + vuln + build + test |
| `bun run check:web` | Web: install + lint + typecheck + test |
| `bun run check:all` | check + check:web + e2e |
| `bun run e2e` | E2E tests (in-process server) |
| `bun run e2e:cluster` | E2E tests against Docker cluster |
| `bun run docker:dev` | Start full Docker Compose dev environment |
| `bun run docker:build` | Build Go Docker image |
| `bun run docs:dev` | Start docs dev server |
| `bun run docs:build` | Build static docs site |
## Quality Gates

Before submitting a PR, ensure:

```bash
bun run check      # Must pass: Go lint, vuln, build, unit tests
bun run check:web  # Must pass: Biome lint, typecheck, 28 unit tests
bun run e2e        # Must pass: 46 E2E acceptance tests
```

The CI pipeline runs `check`, `check:web`, `e2e`, and `e2e:cluster` on every push and PR. CI uses `mise exec -- bun run <script>` to ensure correct tool versions.

## Project Layout

When adding new features, follow the existing package structure:

- **New service** → create a package under `internal/`, define the interface where it's consumed
- **New handler** → add to `internal/http/handlers/`, wire in `cmd/strata/main.go`
- **New middleware** → add to `internal/http/middleware/`
- **New migration** → add to `internal/db/migrations/` with the next sequence number
- **New E2E test** → add to `e2e/` with the `e2e` build tag
- **New tRPC procedure** → add to `web/apps/api/src/router/`, add tests in `__tests__/`
- **New React page** → add to `web/apps/ui/src/pages/`

## Docker Images

Three Docker images, one per service:

1. **strata** (Go API) — `golang:1.26.1-alpine` builder → `scratch` final image with built-in `healthcheck` subcommand
2. **strata-web** (tRPC API) — `oven/bun:1.2-alpine` builder with `bun build --compile` → `distroless` final image
3. **strata-ui** (React SPA) — `oven/bun:1.2-alpine` builder with Vite → `scratch` serving static files

All images use minimal base images (`scratch` or `distroless`) with no shell, no package manager, and no utilities.
