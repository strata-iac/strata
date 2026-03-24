import { describe, expect, test } from "bun:test";
import { stacksListInputSchema } from "./stacks.js";

describe("stacks.list input schema", () => {
	test("accepts undefined input for backward compatibility", () => {
		const parsed = stacksListInputSchema.parse(undefined);
		expect(parsed).toBeUndefined();
	});

	test("validates pageSize bounds", () => {
		expect(() => stacksListInputSchema.parse({ pageSize: 0 })).toThrow();
		expect(() => stacksListInputSchema.parse({ pageSize: 201 })).toThrow();
		expect(stacksListInputSchema.parse({ pageSize: 50 })).toEqual({
			pageSize: 50,
			sortBy: "name",
			sortOrder: "asc",
		});
	});

	test("validates sortBy and sortOrder enums", () => {
		expect(stacksListInputSchema.parse({ sortBy: "name", sortOrder: "asc" })).toEqual({
			sortBy: "name",
			sortOrder: "asc",
			pageSize: 50,
		});
		expect(() => stacksListInputSchema.parse({ sortBy: "invalid" })).toThrow();
		expect(() => stacksListInputSchema.parse({ sortOrder: "up" })).toThrow();
	});
});
