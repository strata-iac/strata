// E2E test lifecycle — docker compose deps + server before all tests.

import { afterAll, beforeAll, setDefaultTimeout } from "bun:test";
import type { Subprocess } from "bun";
import { apiRequest, ensureDeps, resetDatabase, startServer, stopServer } from "./helpers.js";

setDefaultTimeout(120_000);

let server: Subprocess;

beforeAll(async () => {
	await ensureDeps();
	await resetDatabase();
	server = await startServer();
	await warmupServer();
});

afterAll(async () => {
	if (server) {
		await stopServer(server);
	}
});

// Prime Drizzle connection pool + query planner beyond /healthz readiness.
// Under `bun test --shard=M/N`, the first test file per shard runs against
// a cold backend and can see transient 5xx under stress (procella-fkf).
async function warmupServer(): Promise<void> {
	await Promise.all(Array.from({ length: 5 }, () => apiRequest("/user")));
}
