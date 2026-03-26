import { createAuthService } from "@procella/auth";
import { loadConfig } from "@procella/config";
import { AesCryptoService, devMasterKey } from "@procella/crypto";
import { createDb } from "@procella/db";
import { PostgresStacksService } from "@procella/stacks";
import { createBlobStorage } from "@procella/storage";
import { PostgresUpdatesService } from "@procella/updates";
import { createApp } from "./routes/index.js";

export async function bootstrap() {
	console.log("[bootstrap] loadConfig");
	const config = loadConfig();
	console.log(
		"[bootstrap] config ok, authMode=%s, dbUrl=%s",
		config.authMode,
		config.databaseUrl?.replace(/\/\/.*@/, "//***@"),
	);

	console.log("[bootstrap] createDb");
	const { db, client } = await createDb({ url: config.databaseUrl, max: config.databasePoolMax });
	console.log("[bootstrap] db ok");

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
	console.log("[bootstrap] createAuthService");
	const auth = createAuthService(authConfig);

	console.log("[bootstrap] createBlobStorage");
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

	console.log("[bootstrap] creating services + app");
	const stacksService = new PostgresStacksService({ db });
	const updatesService = new PostgresUpdatesService({ db, storage, crypto });

	const app = createApp({
		auth,
		authConfig,
		corsOrigins: config.corsOrigins,
		db,
		stacks: stacksService,
		updates: updatesService,
	});

	console.log("[bootstrap] complete");
	return { app, auth, config, db, client };
}
