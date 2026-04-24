// Unit tests for warmupServer — guards the regressions caught in PR #142 review:
// (1) silent-pass when every request returns 5xx (the exact cold-start scenario),
// (2) leaked Response bodies blocking connection-pool reuse.
//
// This test mocks the fetcher instead of hitting a real server, so it does not
// depend on the preload'd beforeAll in ./setup.ts having spawned Postgres.

import { describe, expect, test } from "bun:test";
import { type Fetcher, warmupServer } from "./warmup.js";

function makeResponse(status: number, onCancel?: () => void): Response {
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(`{"status":${status}}`));
		},
		cancel() {
			onCancel?.();
		},
	});
	return new Response(stream, { status });
}

describe("warmupServer", () => {
	test("succeeds when at least one response is ok", async () => {
		let i = 0;
		const fetcher: Fetcher = async () => makeResponse(i++ === 2 ? 200 : 500);
		await expect(warmupServer(fetcher)).resolves.toBeUndefined();
	});

	test("throws when every response is 5xx — must not silently pass at cold-start", async () => {
		const fetcher: Fetcher = async () => makeResponse(503);
		await expect(warmupServer(fetcher)).rejects.toThrow(/no successful.*503, 503, 503, 503, 503/);
	});

	test("throws when every response is 4xx (auth misconfigured)", async () => {
		const fetcher: Fetcher = async () => makeResponse(401);
		await expect(warmupServer(fetcher)).rejects.toThrow(/401/);
	});

	test("drains response bodies so sockets return to the pool", async () => {
		let cancelled = 0;
		const fetcher: Fetcher = async () => makeResponse(200, () => cancelled++);
		await warmupServer(fetcher);
		expect(cancelled).toBe(5);
	});

	test("drains response bodies even when responses are 5xx", async () => {
		let cancelled = 0;
		const fetcher: Fetcher = async () => makeResponse(500, () => cancelled++);
		await expect(warmupServer(fetcher)).rejects.toThrow();
		expect(cancelled).toBe(5);
	});

	test("issues exactly 5 warmup requests", async () => {
		let count = 0;
		const fetcher: Fetcher = async () => {
			count++;
			return makeResponse(200);
		};
		await warmupServer(fetcher);
		expect(count).toBe(5);
	});
});
