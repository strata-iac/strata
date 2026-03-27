import { vpc, database, databaseUrl } from "./database";
import { bucket } from "./storage";
import { allSecrets, encryptionKey, devAuthToken } from "./secrets";

export const gc = new sst.aws.Cron("ProcellaGcCron", {
	schedule: "rate(1 minute)",
	job: {
		handler: "apps/server/src/lambda-stub.handler",
		timeout: "60 seconds",
		memory: "256 MB",
		vpc,
		link: [database, bucket, ...allSecrets],
		environment: {
			PROCELLA_DATABASE_URL: databaseUrl,
			PROCELLA_BLOB_BACKEND: "s3",
			PROCELLA_BLOB_S3_BUCKET: bucket.name,
			PROCELLA_AUTH_MODE: "dev",
			PROCELLA_DEV_AUTH_TOKEN: devAuthToken.value,
			PROCELLA_ENCRYPTION_KEY: encryptionKey.value,
		},
		transform: {
			function: {
				runtime: "provided.al2023",
				architectures: ["x86_64"],
				handler: "bootstrap",
				code: new $util.asset.FileArchive(".build/gc"),
			},
		},
	},
});
