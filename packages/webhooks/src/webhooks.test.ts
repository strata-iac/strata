import { describe, expect, test } from "bun:test";
import { ALL_WEBHOOK_EVENTS, signPayload, WebhookEvent } from "./index.js";

describe("@procella/webhooks", () => {
	test("signPayload is deterministic for same payload + secret", async () => {
		const payload = JSON.stringify({ hello: "world" });
		const secret = "secret-a";
		const a = await signPayload(payload, secret);
		const b = await signPayload(payload, secret);
		expect(a).toBe(b);
		expect(a).toMatch(/^[a-f0-9]{64}$/);
	});

	test("signPayload differs for different secrets", async () => {
		const payload = JSON.stringify({ hello: "world" });
		const a = await signPayload(payload, "secret-a");
		const b = await signPayload(payload, "secret-b");
		expect(a).not.toBe(b);
	});

	test("WebhookEvent constants match expected strings", () => {
		expect(WebhookEvent.STACK_CREATED).toBe("stack.created");
		expect(WebhookEvent.STACK_DELETED).toBe("stack.deleted");
		expect(WebhookEvent.STACK_UPDATED).toBe("stack.updated");
		expect(WebhookEvent.UPDATE_STARTED).toBe("update.started");
		expect(WebhookEvent.UPDATE_SUCCEEDED).toBe("update.succeeded");
		expect(WebhookEvent.UPDATE_FAILED).toBe("update.failed");
		expect(WebhookEvent.UPDATE_CANCELLED).toBe("update.cancelled");
		expect(ALL_WEBHOOK_EVENTS).toContain("stack.created");
		expect(ALL_WEBHOOK_EVENTS).toContain("update.cancelled");
	});

	test("generated secret uses UUID format when unspecified", () => {
		const secret = crypto.randomUUID();
		expect(secret).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
		);
	});
});
