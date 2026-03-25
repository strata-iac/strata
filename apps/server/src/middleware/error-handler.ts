import { ProcellaError } from "@procella/types";
import type { ErrorHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { logger } from "../logger.js";

export function errorHandler(): ErrorHandler {
	return (error, c) => {
		if (error instanceof ProcellaError) {
			return c.json(
				{ code: error.statusCode, message: error.message },
				error.statusCode as ContentfulStatusCode,
			);
		}
		logger.error({ err: error, errorType: error?.constructor?.name }, "Unhandled error");
		return c.json(
			{
				code: 500,
				message: "Internal server error",
				debug: {
					type: error?.constructor?.name,
					message: error?.message,
					cause: describeError(error?.cause),
				},
			},
			500,
		);
	};
}

function describeError(err: unknown, depth = 0): unknown {
	if (err == null || depth > 5) return undefined;
	if (typeof err !== "object") return String(err);
	const rec = err as Record<string, unknown>;
	return {
		type: (err as Error)?.constructor?.name,
		code: rec.code,
		message: rec.message,
		cause: describeError(rec.cause, depth + 1),
		errors: Array.isArray(rec.errors)
			? rec.errors.map((e: unknown) => describeError(e, depth + 1))
			: undefined,
	};
}
