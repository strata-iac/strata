import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { requireExplicitEncryptionKey } from "./bootstrap.js";

const DEV_KEY = createHash("sha256").update("procella-dev-encryption-key").digest("hex");

describe("@procella/server bootstrap", () => {
	test("rejects missing encryption key", () => {
		expect(() => requireExplicitEncryptionKey(undefined)).toThrow(
			/PROCELLA_ENCRYPTION_KEY is required/,
		);
	});

	test("rejects the well-known dev encryption key", () => {
		expect(() => requireExplicitEncryptionKey(DEV_KEY)).toThrow(/well-known dev value/);
	});

	test("accepts explicit random encryption keys", () => {
		expect(requireExplicitEncryptionKey("a".repeat(64))).toBe("a".repeat(64));
	});
});
