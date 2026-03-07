import { z } from "zod";

const devUserSchema = z.object({
	token: z.string(),
	login: z.string(),
	org: z.string(),
	role: z.string(),
});

const envSchema = z.object({
	PORT: z.coerce.number().default(3000),
	DATABASE_URL: z.string(),
	AUTH_MODE: z.enum(["dev", "descope"]).default("dev"),

	// Dev mode
	DEV_AUTH_TOKEN: z.string().optional(),
	DEV_USER_LOGIN: z.string().default("dev-user"),
	DEV_ORG_LOGIN: z.string().default("dev-org"),
	DEV_USERS: z
		.string()
		.default("[]")
		.transform((s) => z.array(devUserSchema).parse(JSON.parse(s))),

	// Descope
	DESCOPE_PROJECT_ID: z.string().optional(),
});

function loadEnv() {
	const raw = {
		PORT: process.env.STRATA_WEB_PORT ?? process.env.PORT,
		DATABASE_URL: process.env.STRATA_DATABASE_URL,
		AUTH_MODE: process.env.STRATA_AUTH_MODE,
		DEV_AUTH_TOKEN: process.env.STRATA_DEV_AUTH_TOKEN,
		DEV_USER_LOGIN: process.env.STRATA_DEV_USER_LOGIN,
		DEV_ORG_LOGIN: process.env.STRATA_DEV_ORG_LOGIN,
		DEV_USERS: process.env.STRATA_DEV_USERS,
		DESCOPE_PROJECT_ID: process.env.STRATA_DESCOPE_PROJECT_ID,
	};

	const parsed = envSchema.safeParse(raw);
	if (!parsed.success) {
		const formatted = parsed.error.flatten().fieldErrors;
		const msg = Object.entries(formatted)
			.map(([k, v]) => `  ${k}: ${(v ?? []).join(", ")}`)
			.join("\n");
		throw new Error(`Invalid environment:\n${msg}`);
	}
	return parsed.data;
}

export const env = loadEnv();
export type Env = typeof env;
