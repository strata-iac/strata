import { timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { env } from "./env.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface Caller {
	readonly userId: string;
	readonly login: string;
	readonly org: string;
	readonly role: string;
}

// ── Dev authenticator ────────────────────────────────────────────────────────

function authenticateDev(authHeader: string | undefined): Caller {
	if (!authHeader) {
		throw new TRPCError({ code: "UNAUTHORIZED", message: "Missing Authorization header" });
	}

	const token = extractToken(authHeader);
	if (!token) {
		throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid Authorization format" });
	}

	// Check primary dev token
	if (env.DEV_AUTH_TOKEN && safeEquals(token, env.DEV_AUTH_TOKEN)) {
		return {
			userId: "dev-user-id",
			login: env.DEV_USER_LOGIN,
			org: env.DEV_ORG_LOGIN,
			role: "admin",
		};
	}

	// Check additional dev users
	for (const user of env.DEV_USERS) {
		if (safeEquals(token, user.token)) {
			return {
				userId: `dev-${user.login}-id`,
				login: user.login,
				org: user.org,
				role: user.role,
			};
		}
	}

	throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid token" });
}

// ── Descope authenticator ────────────────────────────────────────────────────

async function authenticateDescope(authHeader: string | undefined): Promise<Caller> {
	if (!authHeader) {
		throw new TRPCError({ code: "UNAUTHORIZED", message: "Missing Authorization header" });
	}

	const token = extractBearerToken(authHeader) ?? extractToken(authHeader);
	if (!token) {
		throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid Authorization format" });
	}

	// Descope JWT validation — lazy-import to avoid loading SDK in dev mode
	const { default: DescopeSdk } = await import("@descope/node-sdk");
	const sdk = DescopeSdk({ projectId: env.DESCOPE_PROJECT_ID ?? "" });
	const result = await sdk.validateJwt(token);

	const tenants = (result.token?.tenants ?? {}) as Record<string, { roles?: readonly string[] }>;
	const [org, tenantInfo] = Object.entries(tenants)[0] ?? [];

	if (!org) {
		throw new TRPCError({ code: "FORBIDDEN", message: "No tenant association found" });
	}

	const roles = tenantInfo?.roles ?? [];
	const role = roles.includes("admin") ? "admin" : roles.includes("member") ? "member" : "viewer";

	return {
		userId: result.token?.sub ?? "",
		login: (result.token?.email as string) ?? result.token?.sub ?? "",
		org,
		role,
	};
}

// ── Public API ───────────────────────────────────────────────────────────────

export function authenticate(authHeader: string | undefined): Caller | Promise<Caller> {
	if (env.AUTH_MODE === "descope") {
		return authenticateDescope(authHeader);
	}
	return authenticateDev(authHeader);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractToken(header: string): string | undefined {
	const match = header.match(/^token\s+(.+)$/i);
	return match?.[1];
}

function extractBearerToken(header: string): string | undefined {
	const match = header.match(/^Bearer\s+(.+)$/i);
	return match?.[1];
}

function safeEquals(a: string, b: string): boolean {
	const bufA = Buffer.from(a);
	const bufB = Buffer.from(b);
	if (bufA.length !== bufB.length) {
		return false;
	}
	return timingSafeEqual(bufA, bufB);
}
