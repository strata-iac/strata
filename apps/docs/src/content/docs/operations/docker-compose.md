---
title: Docker Compose
description: Development and cluster deployment profiles.
---

The `docker-compose.yml` uses [Docker Compose profiles](https://docs.docker.com/compose/profiles/) to serve multiple deployment configurations from a single file.

## Profiles

### Default (no profile) — Dependencies Only

```bash
docker compose up -d
```

Starts only the shared infrastructure:
- **PostgreSQL 17** — database on port 5432
- **MinIO** — S3-compatible blob storage on ports 9000 (API) and 9001 (console)
- **MinIO Init** — one-shot container that creates the `strata-checkpoints` bucket

Use this when running the Strata server directly on your machine (e.g., via `bun run dev`).

### Cluster Profile — Multi-Replica

```bash
bun run docker:cluster
# or: docker compose --profile cluster up --build
```

Starts the dependencies plus:
- **3 Strata replicas** — using Docker Compose `deploy.replicas: 3`
- **Caddy** — reverse proxy on port 9090 with round-robin load balancing and health checks

## Caddy Configuration

Caddy routes all requests to the Strata server(s):

```
:9090 {
    handle /api/* {
        reverse_proxy strata:9090
    }
    handle /trpc/* {
        reverse_proxy strata:9090
    }
    handle {
        # Static SPA fallback
    }
}
```

Both `/api/*` (Pulumi CLI protocol) and `/trpc/*` (dashboard API) route to the same Strata server, since both are served by a single Bun process.

In the cluster profile, Caddy load-balances across 3 replicas with health checks.

## Healthcheck

All Strata containers expose a health endpoint:

```
GET /healthz → 200 OK
```

Docker Compose uses `curl` to check health:

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:9090/healthz"]
  interval: 5s
  timeout: 3s
  retries: 10
```

## Bun Scripts

| Script | Command | Description |
|---|---|---|
| `bun run dev` | Starts deps + Bun server + Vite UI | Full dev environment |
| `bun run dev:down` | `docker compose down -v` | Stop dev + remove volumes |
| `bun run docker:build` | `docker build -t strata:dev .` | Build Docker image |
| `bun run docker:cluster` | `docker compose --profile cluster up --build` | Start cluster |

## Volumes

Two named volumes persist data across container restarts:

| Volume | Container | Purpose |
|---|---|---|
| `postgres-data` | postgres | Database files |
| `minio-data` | minio | Blob storage files |

Use `bun run dev:down` to stop containers and remove volumes for a clean slate.
