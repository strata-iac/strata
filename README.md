# Strata

A self-hosted [Pulumi](https://www.pulumi.com/) backend. Run `pulumi login`, `pulumi stack init`, `pulumi up`, and every other CLI command against your own infrastructure — no Pulumi Cloud account required.

## Features

- **Full Pulumi CLI compatibility** — login, stack management, updates, previews, refreshes, destroys, state import/export
- **Web dashboard** — React SPA with real-time stack, update, and event views via tRPC
- **Multi-tenant authentication** — dev mode with static tokens or [Descope](https://www.descope.com/) access keys with tenant RBAC
- **Role-based access control** — viewer / member / admin roles enforced per-organization
- **AES-256-GCM encryption** — per-stack key derivation via HKDF for secrets at rest
- **Horizontal scaling** — stateless server behind Caddy load balancer, PostgreSQL for all shared state
- **S3-compatible blob storage** — local filesystem or any S3-compatible backend (AWS S3, MinIO, R2)
- **Single process** — CLI API + tRPC dashboard share one Hono server
- **Minimal Docker image** — `bun build --compile` → debian-slim

## Tech Stack

| Component | Technology |
|---|---|
| Runtime | Bun 1.2 |
| HTTP Router | Hono v4 |
| Dashboard API | tRPC v11 + Drizzle ORM |
| Dashboard UI | React 19, Vite 7, Tailwind CSS v4 |
| Database | PostgreSQL 17 |
| Auth | Descope / static tokens |
| Encryption | AES-256-GCM + HKDF |
| Blob Storage | Local filesystem / S3 |
| Reverse Proxy | Caddy 2 |
| Quality | Biome + TypeScript strict |

## Quick Start

```bash
# Clone and start the dev environment
git clone https://github.com/strata-iac/strata.git
cd strata
bun run dev
```

This starts PostgreSQL, MinIO, the Bun server (with hot-reload), and the Vite UI dev server locally.

```bash
# Point the Pulumi CLI at your local Strata instance
export PULUMI_ACCESS_TOKEN=devtoken123
pulumi login http://localhost:9090

# Create and deploy a stack
mkdir my-project && cd my-project
pulumi new typescript
pulumi up
```

## Running in Production

For horizontal scaling with multiple replicas behind a load balancer:

```bash
bun run docker:cluster   # 3 replicas + Caddy LB + PostgreSQL + MinIO
bun run e2e:cluster      # Run acceptance tests against the cluster

See the [Horizontal Scaling](apps/docs/src/content/docs/operations/horizontal-scaling.md) guide for production deployment details.

## Quality Gates

```bash
bun run check          # biome lint + typecheck + 320 unit tests
bun run e2e            # E2E acceptance tests (89 tests)
bun run check:all      # check + e2e
```

## Documentation

Full documentation is available in the [`apps/docs/`](apps/docs/) directory, built with [Starlight](https://starlight.astro.build/):

```bash
bun run docs:dev       # Start docs dev server
bun run docs:build     # Build static docs site
```

- [Introduction](apps/docs/src/content/docs/getting-started/introduction.md)
- [Quick Start](apps/docs/src/content/docs/getting-started/quickstart.md)
- [Configuration](apps/docs/src/content/docs/getting-started/configuration.md)
- [Architecture Overview](apps/docs/src/content/docs/architecture/overview.md)
- [API Reference](apps/docs/src/content/docs/api/stacks.md)

## Project Structure

```
packages/
  types/              Pulumi protocol types + domain types + errors
  config/             Zod-validated env config (STRATA_*)
  db/                 Drizzle schema + Bun.sql connection factory
  crypto/             AES-256-GCM with HKDF per-stack key derivation
  storage/            Blob storage (local filesystem + S3)
  auth/               Dev mode (static token) + Descope (JWT)
  stacks/             Stack CRUD, rename, tags (PostgreSQL)
  updates/            Update lifecycle, checkpoints, events, GC worker
apps/
  api/                @strata/api — tRPC router (stacks, updates, events)
  server/             @strata/server — Hono HTTP server (CLI + tRPC + middleware)
  ui/                 @strata/ui — React SPA (Vite + Tailwind + tRPC client)
examples/             Pulumi YAML example programs (7 examples)
e2e/                  E2E acceptance tests (89 tests, 9 files)
  docs/               @strata/docs — Starlight documentation site
```

## License

See [LICENSE](LICENSE) for details.
