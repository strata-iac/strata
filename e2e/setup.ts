// E2E test lifecycle — start server before all tests, stop after.

import { afterAll, beforeAll, setDefaultTimeout } from "bun:test";
import type { Subprocess } from "bun";
import { resetDatabase, startServer, stopServer } from "./helpers.js";

// E2E tests can be slow (server startup, CLI calls)
setDefaultTimeout(60_000);

let server: Subprocess;

beforeAll(async () => {
	await resetDatabase();
	server = await startServer();
});

afterAll(async () => {
	if (server) {
		await stopServer(server);
	}
});
