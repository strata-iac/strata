// @procella/telemetry — Span creation utilities for instrumenting application code.
//
// withSpan() wraps any async function in a child span.
// withDbSpan() adds standard database semantic attributes.
// These are no-ops when telemetry is disabled (the tracer returns NoopSpans).

import { SpanStatusCode, trace } from "@opentelemetry/api";

/**
 * Wrap an async function in a named span. The span is automatically ended
 * on completion and records exceptions on failure.
 */
export async function withSpan<T>(
	tracerName: string,
	spanName: string,
	attrs: Record<string, string | number | boolean>,
	fn: () => Promise<T>,
): Promise<T> {
	const tracer = trace.getTracer(tracerName);
	return tracer.startActiveSpan(spanName, { attributes: attrs }, async (span) => {
		try {
			const result = await fn();
			span.setStatus({ code: SpanStatusCode.OK });
			return result;
		} catch (err) {
			span.setStatus({
				code: SpanStatusCode.ERROR,
				message: err instanceof Error ? err.message : String(err),
			});
			span.recordException(err instanceof Error ? err : new Error(String(err)));
			throw err;
		} finally {
			span.end();
		}
	});
}

/**
 * Wrap an async function in a span with standard database semantic attributes.
 * Designed for instrumenting Drizzle ORM / raw SQL operations.
 */
export async function withDbSpan<T>(
	operation: string,
	attrs: Record<string, string | number | boolean>,
	fn: () => Promise<T>,
): Promise<T> {
	return withSpan(
		"procella.db",
		`db.${operation}`,
		{
			"db.system": "postgresql",
			"db.operation": operation,
			...attrs,
		},
		fn,
	);
}

export function getTracer(name: string) {
	return trace.getTracer(name);
}
