import type { CreateDbOptions } from "@procella/db";
import type { ScheduledEvent } from "aws-lambda";

let dbPromise: ReturnType<typeof init> | null = null;

async function init() {
	const { loadConfig } = await import("@procella/config");
	const { createDb } = await import("@procella/db");
	const config = loadConfig();

	const dbOptions: CreateDbOptions =
		config.databaseDriver === "data-api"
			? {
					driver: "data-api" as const,
					secretArn: config.databaseSecretArn as string,
					resourceArn: config.databaseClusterArn as string,
					database: config.databaseName as string,
				}
			: { url: config.databaseUrl as string, max: config.databasePoolMax };

	const { db } = await createDb(dbOptions);
	return db;
}

export const handler = async (_event: ScheduledEvent): Promise<void> => {
	if (!dbPromise) dbPromise = init();
	const db = await dbPromise;

	const { GCWorker } = await import("@procella/updates");
	const gc = new GCWorker({ db });
	await gc.runOnce();
};
