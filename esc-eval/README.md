# esc-eval — Procella ESC evaluator Lambda

Embeds [`github.com/pulumi/esc`](https://github.com/pulumi/esc) (Apache-2.0, v0.23.0) as a Go library to evaluate ESC YAML environments. Part of the `procella-yj7` epic (Pulumi ESC equivalent).

## Architecture decision

See [`.sisyphus/analysis/esc-evaluator-decision.md`](../.sisyphus/analysis/esc-evaluator-decision.md). **Path A** — direct library import — confirmed by local spike.

## Invocation contract

The TS side (`packages/esc/src/evaluator-client.ts`) resolves the entire import graph from PostgreSQL before invoking. The Lambda payload:

```json
{
  "definition": "<YAML body of target environment>",
  "imports":    { "project/env": "<YAML body>" },
  "encryptionKeyHex": "<64 hex chars>"
}
```

The Lambda never reads from the DB or the network for imports — all inputs are in the payload.

## Build

```bash
make build    # writes ../.build/esc-eval/bootstrap (linux amd64)
make tidy
make test
```

SST infra lives in `infra/esc.ts` (procella-yj7.12) and points at `.build/esc-eval` with `handler: bootstrap`, `runtime: provided.al2023`, matching the existing `api`/`gc`/`migrate` Lambda pattern.

## Status

| Task | Status |
|---|---|
| procella-yj7.1 — validate Go library import | ✅ done |
| procella-yj7.3 — scaffold Go module + Lambda skeleton | 🟡 in progress (this PR) |
| procella-yj7.11 — implement handler with `eval.EvalEnvironment` | open |
| procella-yj7.12 — SST infra (`infra/esc.ts`) | open |
| procella-yj7.15 — CI Go build step | open |
