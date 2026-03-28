import { vpc, database, databaseUrl } from "./database";
import { bucket } from "./storage";
import {
	allSecrets,
	encryptionKey,
	devAuthToken,
	descopeManagementKey,
} from "./secrets";

const isProd = $app.stage === "production";
const stage = $app.stage;

const descopeProjectId = isProd
	? (await import("./descope")).projectId
	: undefined;

const appOrigin = isProd ? "https://app.procella.cloud" : `https://app.${stage}.procella.cloud`;

export const api = new sst.aws.Function("ProcellaApi", {
	runtime: "provided.al2023",
	architecture: "x86_64",
	bundle: ".build/api",
	handler: "bootstrap",
	url: {
		cors: false,
	},
	timeout: "60 seconds",
	memory: "512 MB",
	vpc,
	link: [database, bucket, ...allSecrets],
	environment: {
		PROCELLA_DATABASE_URL: databaseUrl,
		PROCELLA_BLOB_BACKEND: "s3",
		PROCELLA_BLOB_S3_BUCKET: bucket.name,
		PROCELLA_AUTH_MODE: isProd ? "descope" : "dev",
		PROCELLA_ENCRYPTION_KEY: encryptionKey.value,
		PROCELLA_CORS_ORIGINS: appOrigin,
		...(!isProd ? { PROCELLA_DEV_AUTH_TOKEN: devAuthToken.value } : {}),
		...(isProd
			? {
					PROCELLA_DESCOPE_PROJECT_ID: descopeProjectId,
					PROCELLA_DESCOPE_MANAGEMENT_KEY: descopeManagementKey.value,
				}
			: {}),
	},
});

export const router = new sst.aws.Router("ProcellaRouter", {
	domain: isProd ? "api.procella.cloud" : `api.${stage}.procella.cloud`,
	routes: {
		"/*": api.url,
	},
});

import * as fs from "node:fs";
import * as crypto from "node:crypto";
import * as command from "@pulumi/command";

const migrationHash = crypto
	.createHash("sha256")
	.update(
		["0000_medical_fabian_cortez.sql", "0001_add_journal_entries.sql", "0002_extend_journal_entries.sql"]
			.map((f) => fs.readFileSync(`packages/db/drizzle/${f}`, "utf8"))
			.join("\n"),
	)
	.digest("hex");

export const migrateFn = new sst.aws.Function("ProcellaMigrate", {
	runtime: "provided.al2023",
	architecture: "x86_64",
	bundle: ".build/migrate",
	handler: "bootstrap",
	timeout: "5 minutes",
	memory: "256 MB",
	vpc,
	link: [database, ...allSecrets],
	environment: {
		PROCELLA_DATABASE_URL: databaseUrl,
		PROCELLA_AUTH_MODE: "dev",
		PROCELLA_DEV_AUTH_TOKEN: devAuthToken.value,
		PROCELLA_ENCRYPTION_KEY: encryptionKey.value,
		PROCELLA_BLOB_BACKEND: "s3",
		PROCELLA_BLOB_S3_BUCKET: bucket.name,
	},
});

new command.local.Command("ProcellaMigrateRun", {
	create: $interpolate`aws lambda invoke --function-name ${migrateFn.name} --payload '{}' --cli-binary-format raw-in-base64-out --cli-read-timeout 360 /tmp/migrate-out-${stage}.json && cat /tmp/migrate-out-${stage}.json`,
	triggers: [migrationHash],
});
