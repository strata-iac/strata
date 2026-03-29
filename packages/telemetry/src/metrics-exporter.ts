// Bun-compatible OTLP metrics exporter using native fetch.
// Same workaround as fetch-exporter.ts for traces (opentelemetry-js#5260).

import type { ExportResult } from "@opentelemetry/core";
import { ExportResultCode } from "@opentelemetry/core";
import { JsonMetricsSerializer } from "@opentelemetry/otlp-transformer";
import type { ResourceMetrics } from "@opentelemetry/sdk-metrics";

interface PushMetricExporter {
	export(metrics: ResourceMetrics, resultCallback: (result: ExportResult) => void): void;
	forceFlush(): Promise<void>;
	shutdown(): Promise<void>;
}

function resolveEndpoint(configUrl?: string): string {
	if (configUrl) return configUrl;
	const metricsEndpoint = process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT;
	if (metricsEndpoint) return metricsEndpoint;
	const baseEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";
	return `${baseEndpoint.replace(/\/$/, "")}/v1/metrics`;
}

function parseHeadersEnv(): Record<string, string> {
	const raw = process.env.OTEL_EXPORTER_OTLP_HEADERS ?? "";
	if (!raw) return {};
	const headers: Record<string, string> = {};
	for (const pair of raw.split(",")) {
		const idx = pair.indexOf("=");
		if (idx > 0) {
			headers[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
		}
	}
	return headers;
}

export class FetchOtlpMetricExporter implements PushMetricExporter {
	private readonly url: string;
	private readonly headers: Record<string, string>;

	constructor(config?: { url?: string }) {
		this.url = resolveEndpoint(config?.url);
		this.headers = parseHeadersEnv();
	}

	export(metrics: ResourceMetrics, resultCallback: (result: ExportResult) => void): void {
		const bytes = JsonMetricsSerializer.serializeRequest(metrics);
		if (!bytes) {
			resultCallback({ code: ExportResultCode.FAILED });
			return;
		}

		const body = new TextDecoder().decode(bytes);
		fetch(this.url, {
			method: "POST",
			headers: { "Content-Type": "application/json", ...this.headers },
			body,
		})
			.then((res) => {
				if (!res.ok) {
					process.stderr.write(
						`[otlp-metrics] export failed: ${res.status} ${res.statusText} → ${this.url}\n`,
					);
				}
				resultCallback({ code: res.ok ? ExportResultCode.SUCCESS : ExportResultCode.FAILED });
			})
			.catch((err) => {
				process.stderr.write(
					`[otlp-metrics] export error: ${err instanceof Error ? err.message : err} → ${this.url}\n`,
				);
				resultCallback({ code: ExportResultCode.FAILED });
			});
	}

	async forceFlush(): Promise<void> {}
	async shutdown(): Promise<void> {}
}
