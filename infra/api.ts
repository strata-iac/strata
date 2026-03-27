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

export const api = new sst.aws.Function("ProcellaApi", {
	handler: "apps/server/src/lambda-stub.handler",
	url: true,
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
		...(!isProd ? { PROCELLA_DEV_AUTH_TOKEN: devAuthToken.value } : {}),
		...(isProd
			? {
					PROCELLA_DESCOPE_PROJECT_ID: descopeProjectId,
					PROCELLA_DESCOPE_MANAGEMENT_KEY: descopeManagementKey.value,
				}
			: {}),
	},
	transform: {
		function: {
			runtime: "provided.al2023",
			architectures: ["x86_64"],
			handler: "bootstrap",
			code: new $util.asset.FileArchive(".build/api"),
		},
	},
});

export const router = new sst.aws.Router("ProcellaRouter", {
	domain: isProd ? "api.procella.cloud" : `api.${stage}.procella.cloud`,
	routes: {
		"/*": api.url,
	},
});
