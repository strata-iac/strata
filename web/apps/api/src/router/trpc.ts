import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { Caller } from "../auth.js";
import type { Database } from "../db/client.js";

// ── Context ──────────────────────────────────────────────────────────────────

export interface Context {
	readonly db: Database;
	readonly caller: Caller;
}

// ── tRPC init ────────────────────────────────────────────────────────────────

const t = initTRPC.context<Context>().create({
	transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
