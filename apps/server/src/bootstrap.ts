// @procella/server — Shared bootstrap logic for both Bun.serve and Vercel.
//
// Creates all services and the Hono app. Called once at module load time
// in both entry points (index.ts for local dev, vercel.ts for production).

import DescopeSdk from "@descope/node-sdk";
import { DescopeAuditService, NoopAuditService } from "@procella/audit";
import { type AuthService, createAuthService, DescopeAuthService } from "@procella/auth";
import { loadConfig } from "@procella/config";
import { AesCryptoService, devMasterKey } from "@procella/crypto";
import { createDb } from "@procella/db";
import { buildGitHubAppConfig, OctokitGitHubService } from "@procella/github";
import { PostgresStacksService } from "@procella/stacks";
import { createBlobStorage } from "@procella/storage";
import { initTelemetry } from "@procella/telemetry";
import { PostgresUpdatesService } from "@procella/updates";
import { PostgresWebhooksService } from "@procella/webhooks";
import { createApp } from "./routes/index.js";

export async function bootstrap() {
	const config = loadConfig();

	initTelemetry({ enabled: config.otelEnabled, serviceName: "procella" });

	const { db, client } = await createDb({ url: config.databaseUrl, max: config.databasePoolMax });

	// Auth
	const authConfig =
		config.authMode === "dev"
			? {
					mode: "dev" as const,
					token: config.devAuthToken as string,
					userLogin: config.devUserLogin,
					orgLogin: config.devOrgLogin,
				}
			: {
					mode: "descope" as const,
					projectId: config.descopeProjectId as string,
					managementKey: config.descopeManagementKey,
				};
	const auth: AuthService =
		authConfig.mode === "descope"
			? new DescopeAuthService({
					sdk: DescopeSdk({
						projectId: authConfig.projectId,
						managementKey: authConfig.managementKey,
					}),
					config: authConfig,
				})
			: createAuthService(authConfig);

	const storage = createBlobStorage(
		config.blobBackend === "local"
			? { backend: "local", basePath: config.blobLocalPath }
			: {
					backend: "s3",
					bucket: config.blobS3Bucket as string,
					endpoint: config.blobS3Endpoint,
					region: config.blobS3Region,
					accessKeyId: process.env.AWS_ACCESS_KEY_ID,
					secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
				},
	);

	const encryptionKey =
		config.encryptionKey ??
		(config.authMode === "dev"
			? devMasterKey()
			: (() => {
					throw new Error("PROCELLA_ENCRYPTION_KEY is required in production");
				})());
	const crypto = new AesCryptoService(encryptionKey);

	// Domain services
	const stacksService = new PostgresStacksService({ db });
	const updatesService = new PostgresUpdatesService({ db, storage, crypto });
	const auditService =
		authConfig.mode === "descope" && auth instanceof DescopeAuthService
			? new DescopeAuditService(auth.sdk)
			: new NoopAuditService();
	const webhooksService = new PostgresWebhooksService({ db });
	const githubConfig = buildGitHubAppConfig(config);
	const githubService = githubConfig
		? new OctokitGitHubService({ db, config: githubConfig })
		: null;

	// Hono app
	const app = createApp({
		auth,
		authConfig,
		audit: auditService,
		corsOrigins: config.corsOrigins,
		db,
		dbUrl: config.databaseUrl,
		stacks: stacksService,
		updates: updatesService,
		webhooks: webhooksService,
		github: githubService,
		githubWebhookSecret: githubConfig?.webhookSecret,
	});

	return { app, auth, config, db, client };
}
