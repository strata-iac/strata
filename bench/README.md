# Benchmarks

Compares Pulumi update performance with and without server-side journaling.

## Quick Start

```bash
# Use your current pulumi login (no config needed)
bun run bench

# Prerequisites: Pulumi CLI installed, logged in to a Procella backend
```

## Backend Resolution

The benchmark auto-detects which backend to use, in priority order:

1. **Explicit env** — `BENCH_URL` + `BENCH_TOKEN` override everything
2. **Current login** — reads `~/.pulumi/credentials.json` for the backend you're logged into
3. **Local server** — starts a Procella server on port 18081 (requires PostgreSQL running)

```bash
# 1. Explicit: point at a specific server
BENCH_URL=https://api.procella.cloud BENCH_TOKEN=pul-xxx bun run bench

# 2. Current login: just run it (uses whatever `pulumi login` points to)
bun run bench

# 3. Local: if not logged in and no BENCH_URL, starts a local server
#    Requires: docker compose up -d (for postgres)
bun run bench
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `BENCH_URL` | — | Explicit backend URL (overrides login credentials) |
| `BENCH_TOKEN` | — | Explicit API token (overrides login credentials) |
| `BENCH_SIZES` | `10,50,100,500` | Comma-separated resource counts |
| `BENCH_TRIALS` | `3` | Trials per (size, mode) pair |
| `BENCH_MODES` | `journal` | `journal`, `checkpoint`, or both |
| `BENCH_VARIANTS` | `plain,secrets` | `plain`, `secrets`, or both |
| `BENCH_DATABASE_URL` | `PROCELLA_DATABASE_URL` or localhost | DB for metrics collection |

## Examples

```bash
# Fast smoke test against current login
BENCH_SIZES=10 BENCH_TRIALS=1 bun run bench

# Full benchmark
BENCH_SIZES=10,50,100,500,1000 BENCH_TRIALS=5 bun run bench

# Remote with DB metrics
BENCH_URL=https://api.procella.cloud \
  BENCH_TOKEN=pul-xxx \
  BENCH_DATABASE_URL=postgres://user:pass@host:5432/db \
  bun run bench
```

## What It Measures

For each (resource count, mode, trial):

| Metric | Description |
|---|---|
| **up** | Wall-clock time for `pulumi up --yes` |
| **preview** | Wall-clock time for `pulumi preview` |
| **destroy** | Wall-clock time for `pulumi destroy --yes` |
| **checkpoint bytes** | Size of the latest checkpoint in the DB |
| **journal entries** | Count of journal entries for the update |

## Output

- Markdown tables printed to stdout with p50/min/max across trials
- `bench/results.json` written with full trial data

### Example Output

```
| N   | Mode       | up p50   | up min   | up max   | preview p50 | destroy p50 | Status |
| --- | ---        | ---      | ---      | ---      | ---         | ---         | ---    |
| 10  | checkpoint | 2341.0ms | 2100.0ms | 2510.0ms | 1200.0ms    | 800.0ms     | OK     |
| 10  | journal    | 2400.0ms | 2300.0ms | 2600.0ms | FAIL        | FAIL        | FAIL   |
| 50  | checkpoint | 5200.0ms | 4800.0ms | 5600.0ms | 2100.0ms    | 1500.0ms    | OK     |
```

## Files

| File | Purpose |
|---|---|
| `run-benchmark.ts` | Main orchestrator |
| `types.ts` | Result types |
| `generate-programs.ts` | YAML program generator |
| `db-metrics.ts` | Direct DB metric queries |
| `results.json` | Output (gitignored) |

## Notes

- Uses port 18081 (E2E tests use 18080) so both can run concurrently.
- Resource type is `random:index:RandomString` — no cloud provider needed.
- The `checkpoint` mode forces the CLI to use the traditional path via `PULUMI_DISABLE_JOURNALING=true`.
- In login mode, `credentials.json` is copied to an isolated `PULUMI_HOME` per run.
- Stack names use `PULUMI_STACK` env var to avoid workspace state issues with isolated homes.
