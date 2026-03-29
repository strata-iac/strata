import { type Counter, type Histogram, metrics, type UpDownCounter } from "@opentelemetry/api";

let httpDuration: Histogram | null = null;
let httpActiveRequests: UpDownCounter | null = null;
let dbDuration: Histogram | null = null;
let dbOpsCounter: Counter | null = null;
let cryptoOps: Counter | null = null;
let gcCycles: Counter | null = null;
let gcOrphansCleaned: Counter | null = null;
let activeUpdates: UpDownCounter | null = null;
let checkpointSizeBytes: Histogram | null = null;
let journalEntriesCounter: Counter | null = null;

function getMeter() {
	return metrics.getMeter("procella");
}

export function httpRequestDuration(): Histogram {
	if (!httpDuration)
		httpDuration = getMeter().createHistogram("http.server.request.duration", { unit: "ms" });
	return httpDuration;
}

export function httpActiveRequestsGauge(): UpDownCounter {
	if (!httpActiveRequests)
		httpActiveRequests = getMeter().createUpDownCounter("http.server.active_requests");
	return httpActiveRequests;
}

export function dbOperationDuration(): Histogram {
	if (!dbDuration)
		dbDuration = getMeter().createHistogram("db.client.operation.duration", { unit: "ms" });
	return dbDuration;
}

export function dbOperationCount(): Counter {
	if (!dbOpsCounter) dbOpsCounter = getMeter().createCounter("db.client.operation.count");
	return dbOpsCounter;
}

export function cryptoOperationCount(): Counter {
	if (!cryptoOps) cryptoOps = getMeter().createCounter("procella.crypto.operations");
	return cryptoOps;
}

export function gcCycleCount(): Counter {
	if (!gcCycles) gcCycles = getMeter().createCounter("procella.gc.cycles");
	return gcCycles;
}

export function gcOrphansCleanedCount(): Counter {
	if (!gcOrphansCleaned) gcOrphansCleaned = getMeter().createCounter("procella.gc.orphans_cleaned");
	return gcOrphansCleaned;
}

export function activeUpdatesGauge(): UpDownCounter {
	if (!activeUpdates) activeUpdates = getMeter().createUpDownCounter("procella.updates.active");
	return activeUpdates;
}

export function checkpointSizeHistogram(): Histogram {
	if (!checkpointSizeBytes)
		checkpointSizeBytes = getMeter().createHistogram("procella.checkpoint.size_bytes", {
			unit: "By",
		});
	return checkpointSizeBytes;
}

export function journalEntriesCount(): Counter {
	if (!journalEntriesCounter)
		journalEntriesCounter = getMeter().createCounter("procella.journal.entries");
	return journalEntriesCounter;
}

let storageDuration: Histogram | null = null;
let storageSizeBytes: Histogram | null = null;
let authDuration: Histogram | null = null;
let authFailures: Counter | null = null;
let trpcDuration: Histogram | null = null;

export function storageOperationDuration(): Histogram {
	if (!storageDuration)
		storageDuration = getMeter().createHistogram("procella.storage.operation.duration", {
			unit: "ms",
		});
	return storageDuration;
}

export function storageOperationSize(): Histogram {
	if (!storageSizeBytes)
		storageSizeBytes = getMeter().createHistogram("procella.storage.operation.size_bytes", {
			unit: "By",
		});
	return storageSizeBytes;
}

export function authAuthenticateDuration(): Histogram {
	if (!authDuration)
		authDuration = getMeter().createHistogram("procella.auth.duration", { unit: "ms" });
	return authDuration;
}

export function authFailureCount(): Counter {
	if (!authFailures) authFailures = getMeter().createCounter("procella.auth.failures");
	return authFailures;
}

export function trpcProcedureDuration(): Histogram {
	if (!trpcDuration)
		trpcDuration = getMeter().createHistogram("procella.trpc.procedure.duration", { unit: "ms" });
	return trpcDuration;
}
