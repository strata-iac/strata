import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { authenticate } from "./auth.js";
import { db } from "./db/client.js";
import { env } from "./env.js";
import { appRouter } from "./router/index.js";

const app = new Hono();

// ── Middleware ────────────────────────────────────────────────────────────────

app.use("*", logger());
app.use(
	"*",
	cors({
		origin: "*",
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
	}),
);

// ── Health check ─────────────────────────────────────────────────────────────

app.get("/health", (c) => c.json({ status: "ok" }));

// ── tRPC ─────────────────────────────────────────────────────────────────────

app.use(
	"/trpc/*",
	trpcServer({
		router: appRouter,
		createContext: async (_opts, c) => {
			const authHeader = c.req.header("Authorization");
			const caller = await authenticate(authHeader);
			return { db, caller } as Record<string, unknown>;
		},
	}),
);

// ── Start ────────────────────────────────────────────────────────────────────

// biome-ignore lint/suspicious/noConsole: startup log is intentional
console.log(`strata-web listening on :${String(env.PORT)}`);

export default {
	port: env.PORT,
	fetch: app.fetch,
};
