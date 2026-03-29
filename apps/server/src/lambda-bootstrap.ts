// Custom Lambda runtime with response streaming support.
//
// Instead of using hono/aws-lambda (which buffers entire responses), this
// converts Lambda events to standard Request objects, passes them through
// app.fetch(), and streams the Response back via the Lambda Runtime API
// using the streaming protocol:
//
//   Content-Type: application/vnd.awslambda.http-integration-response
//   Lambda-Runtime-Function-Response-Mode: streaming
//   Transfer-Encoding: chunked
//   Body: {JSON prelude}\x00\x00\x00\x00\x00\x00\x00\x00{response body}
//
// This enables SSE (tRPC subscriptions) to stream through Lambda Function
// URLs with InvokeMode: RESPONSE_STREAM.

import type { APIGatewayProxyEventV2 } from "aws-lambda";

const RUNTIME_API = process.env.AWS_LAMBDA_RUNTIME_API!;
const BASE_URL = `http://${RUNTIME_API}/2018-06-01/runtime`;

const NULL_DELIMITER = new Uint8Array(8);
const encoder = new TextEncoder();

/** Convert an APIGatewayProxyEventV2 into a standard Web Request. */
function eventToRequest(event: APIGatewayProxyEventV2): Request {
	const { requestContext, rawPath, rawQueryString, headers, body, isBase64Encoded } = event;
	const method = requestContext.http.method;

	const host =
		headers?.host ?? `${requestContext.apiId}.lambda-url.${process.env.AWS_REGION}.on.aws`;
	const qs = rawQueryString ? `?${rawQueryString}` : "";
	const url = `https://${host}${rawPath}${qs}`;

	const reqHeaders = new Headers();
	if (headers) {
		for (const [key, value] of Object.entries(headers)) {
			if (value !== undefined) reqHeaders.set(key, value);
		}
	}
	// Lambda delivers cookies as a separate array — reassemble into Cookie header
	if (event.cookies?.length) {
		reqHeaders.set("cookie", event.cookies.join("; "));
	}

	let reqBody: BodyInit | null = null;
	if (body && method !== "GET" && method !== "HEAD") {
		reqBody = isBase64Encoded ? Buffer.from(body, "base64") : body;
	}

	return new Request(url, { method, headers: reqHeaders, body: reqBody });
}

/** Stream a Response back to the Lambda Runtime API using the HTTP integration response format. */
async function streamResponse(requestId: string, response: Response): Promise<void> {
	const responseHeaders: Record<string, string> = {};
	response.headers.forEach((value, key) => {
		responseHeaders[key] = value;
	});

	const prelude = JSON.stringify({
		statusCode: response.status,
		headers: responseHeaders,
		cookies: [] as string[],
	});

	const preludeBytes = encoder.encode(prelude);

	const responseBody = response.body;

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			controller.enqueue(preludeBytes);
			controller.enqueue(NULL_DELIMITER);
			if (responseBody) {
				const reader = responseBody.getReader();
				try {
					for (;;) {
						const { done, value } = await reader.read();
						if (done) break;
						controller.enqueue(value);
					}
				} finally {
					reader.releaseLock();
				}
			}
			controller.close();
		},
	});

	await fetch(`${BASE_URL}/invocation/${requestId}/response`, {
		method: "POST",
		headers: {
			"Content-Type": "application/vnd.awslambda.http-integration-response",
			"Lambda-Runtime-Function-Response-Mode": "streaming",
			"Transfer-Encoding": "chunked",
		},
		body: stream,
		// @ts-expect-error — Bun supports duplex: "half" for streaming request bodies
		duplex: "half",
	});
}

(async () => {
	const { bootstrap } = await import("./bootstrap.js");
	const { app } = await bootstrap();

	while (true) {
		const next = await fetch(`${BASE_URL}/invocation/next`);
		const requestId = next.headers.get("Lambda-Runtime-Aws-Request-Id")!;
		const event = (await next.json()) as APIGatewayProxyEventV2;

		try {
			const request = eventToRequest(event);
			const response = await app.fetch(request);
			await streamResponse(requestId, response);
		} catch (err: unknown) {
			const error = err instanceof Error ? err : new Error(String(err));
			await fetch(`${BASE_URL}/invocation/${requestId}/error`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					errorMessage: error.message,
					errorType: error.name,
					stackTrace: error.stack?.split("\n") ?? [],
				}),
			});
		}
	}
})();
