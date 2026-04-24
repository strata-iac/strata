import { apiRequest } from "./helpers.js";

export type Fetcher = (path: string) => Promise<Response>;

// Prime Drizzle connection pool + query planner beyond /healthz readiness.
// Under `bun test --shard=M/N`, the first test file per shard runs against
// a cold backend and can see transient 5xx under stress (procella-fkf).
//
// Throws if every warmup request failed — otherwise a backend that is fully
// broken at cold-start would silently pass this step, defeating the purpose.
export async function warmupServer(fetcher: Fetcher = apiRequest): Promise<void> {
	// allSettled (not all): cold-start can produce partial network failures
	// (ECONNRESET / aborted sockets). Collect every outcome so a single
	// rejected fetch does not short-circuit the check or leak sibling bodies.
	const results = await Promise.allSettled(Array.from({ length: 5 }, () => fetcher("/user")));
	// Drain fulfilled response bodies so Bun returns sockets to the pool and
	// does not hold strong references to unconsumed ArrayBuffers.
	await Promise.all(
		results.flatMap((r) => (r.status === "fulfilled" ? [r.value.body?.cancel()] : [])),
	);
	if (!results.some((r) => r.status === "fulfilled" && r.value.ok)) {
		const details = results
			.map((r) =>
				r.status === "fulfilled" ? String(r.value.status) : `rejected(${String(r.reason)})`,
			)
			.join(", ");
		throw new Error(`warmup: no successful /api/user response (results: ${details})`);
	}
}
