import { describe, expect, test } from "bun:test";
import {
	buildPRCommentBody,
	mapUpdateStatusToCommitState,
	verifyGitHubWebhookSignature,
} from "./index.js";

describe("@procella/github", () => {
	describe("verifyGitHubWebhookSignature", () => {
		test("returns true for valid signature", async () => {
			const payload = JSON.stringify({ hello: "world" });
			const secret = "webhook-secret";
			const key = await crypto.subtle.importKey(
				"raw",
				new TextEncoder().encode(secret),
				{ name: "HMAC", hash: "SHA-256" },
				false,
				["sign"],
			);
			const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
			const hex = Array.from(new Uint8Array(sig))
				.map((b) => b.toString(16).padStart(2, "0"))
				.join("");

			const ok = await verifyGitHubWebhookSignature(payload, `sha256=${hex}`, secret);
			expect(ok).toBe(true);
		});

		test("returns false for tampered signature", async () => {
			const payload = JSON.stringify({ hello: "world" });
			const ok = await verifyGitHubWebhookSignature(payload, "sha256=deadbeef", "webhook-secret");
			expect(ok).toBe(false);
		});

		test("returns false for empty signature", async () => {
			const payload = JSON.stringify({ hello: "world" });
			const ok = await verifyGitHubWebhookSignature(payload, "", "webhook-secret");
			expect(ok).toBe(false);
		});
	});

	describe("buildPRCommentBody", () => {
		test("builds markdown body with table and details link", () => {
			const body = buildPRCommentBody({
				org: "acme",
				project: "infra",
				stack: "dev",
				kind: "preview",
				status: "succeeded",
				resourceChanges: { creates: 3, updates: 1, deletes: 0, sames: 4 },
				permalink: "https://example.com/update/1",
			});

			expect(body).toContain("## Pulumi Preview Results");
			expect(body).toContain("**Stack:** `acme/infra/dev`");
			expect(body).toContain("| Create | 3 |");
			expect(body).toContain("| Update | 1 |");
			expect(body).toContain("| Delete | 0 |");
			expect(body).toContain("[View details](https://example.com/update/1)");
		});

		test("defaults missing resource changes to zero", () => {
			const body = buildPRCommentBody({
				org: "acme",
				project: "infra",
				stack: "dev",
				kind: "preview",
				status: "failed",
			});

			expect(body).toContain("| Create | 0 |");
			expect(body).toContain("| Update | 0 |");
			expect(body).toContain("| Delete | 0 |");
		});
	});

	describe("mapUpdateStatusToCommitState", () => {
		test("maps Procella update statuses to GitHub commit states", () => {
			expect(mapUpdateStatusToCommitState("succeeded")).toBe("success");
			expect(mapUpdateStatusToCommitState("failed")).toBe("failure");
			expect(mapUpdateStatusToCommitState("cancelled")).toBe("failure");
			expect(mapUpdateStatusToCommitState("running")).toBe("pending");
			expect(mapUpdateStatusToCommitState("requested")).toBe("pending");
			expect(mapUpdateStatusToCommitState("not started")).toBe("pending");
			expect(mapUpdateStatusToCommitState("unknown")).toBe("error");
		});
	});
});
