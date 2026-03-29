import { describe, expect, test } from "bun:test";
import { decodeContinuationToken, encodeContinuationToken, sanitizeTsQuery } from "./index.js";

describe("stack search helpers", () => {
	test("continuation token base64 roundtrip", () => {
		const token = encodeContinuationToken({
			id: "stack-id-123",
			sortValue: "2026-03-24T00:00:00.000Z",
		});

		expect(decodeContinuationToken(token)).toEqual({
			id: "stack-id-123",
			sortValue: "2026-03-24T00:00:00.000Z",
		});
	});

	test("throws on malformed continuation token", () => {
		expect(() => decodeContinuationToken("not-base64")).toThrow("Invalid continuation token");
	});

	test("sanitizes tsquery input and strips operators", () => {
		const sanitized = sanitizeTsQuery("prod'); DROP TABLE stacks; -- cloud");
		expect(sanitized).toBe("prod & DROP & TABLE & stacks & cloud");
	});

	test("returns undefined when sanitized query is empty", () => {
		expect(sanitizeTsQuery("!!! ###")).toBeUndefined();
	});
});
