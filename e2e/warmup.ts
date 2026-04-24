import { apiRequest } from "./helpers.js";

export type Fetcher = (path: string) => Promise<Response>;

// Prime Drizzle connection pool + query planner beyond /healthz readiness.
// Under `bun test --shard=M/N`, the first test file per shard runs against
// a cold backend and can see transient 5xx under stress (procella-fkf).
//
// Throws if every warmup request failed — otherwise a backend that is fully
// broken at cold-start would silently pass this step, defeating the purpose.
export async function warmupServer(fetcher: Fetcher = apiRequest): Promise<void> {
	const responses = await Promise.all(Array.from({ length: 5 }, () => fetcher("/user")));
	// Drain response bodies so Bun returns sockets to the pool and does not
	// hold strong references to unconsumed ArrayBuffers.
	await Promise.all(responses.map((r) => r.body?.cancel()));
	if (!responses.some((r) => r.ok)) {
		const statuses = responses.map((r) => r.status).join(", ");
		throw new Error(`warmup: no successful /api/user response (statuses: ${statuses})`);
	}
}
