import { describe, expect, test } from "bun:test";
import {
	AuditAction,
	extractResourceId,
	extractResourceType,
	mapActionToType,
	mapRouteToAction,
} from "./index.js";

describe("@procella/audit", () => {
	test("mapRouteToAction maps known routes", () => {
		expect(mapRouteToAction("POST", "/api/stacks/org/proj/dev")).toBe(AuditAction.STACK_CREATE);
		expect(mapRouteToAction("DELETE", "/api/stacks/org/proj/dev")).toBe(AuditAction.STACK_DELETE);
		expect(mapRouteToAction("POST", "/api/stacks/org/proj/dev/rename")).toBe(
			AuditAction.STACK_RENAME,
		);
		expect(mapRouteToAction("PATCH", "/api/stacks/org/proj/dev/tags")).toBe(
			AuditAction.STACK_TAGS_UPDATE,
		);
		expect(mapRouteToAction("POST", "/api/stacks/org/proj/dev/update")).toBe(
			AuditAction.UPDATE_CREATE,
		);
		expect(mapRouteToAction("POST", "/api/stacks/org/proj/dev/preview")).toBe(
			AuditAction.UPDATE_CREATE,
		);
		expect(mapRouteToAction("POST", "/api/stacks/org/proj/dev/refresh")).toBe(
			AuditAction.UPDATE_CREATE,
		);
		expect(mapRouteToAction("POST", "/api/stacks/org/proj/dev/destroy")).toBe(
			AuditAction.UPDATE_CREATE,
		);
		expect(mapRouteToAction("POST", "/api/stacks/org/proj/dev/update/u1/complete")).toBe(
			AuditAction.UPDATE_COMPLETE,
		);
		expect(mapRouteToAction("POST", "/api/stacks/org/proj/dev/update/u1/cancel")).toBe(
			AuditAction.UPDATE_CANCEL,
		);
		expect(mapRouteToAction("POST", "/api/stacks/org/proj/dev/import")).toBe(
			AuditAction.STACK_IMPORT,
		);
		expect(mapRouteToAction("POST", "/api/orgs/org/tokens")).toBe(AuditAction.TOKEN_CREATE);
		expect(mapRouteToAction("DELETE", "/api/orgs/org/tokens/tok1")).toBe(AuditAction.TOKEN_REVOKE);
	});

	test("mapRouteToAction returns null for unknown routes", () => {
		expect(mapRouteToAction("GET", "/api/stacks/org/proj/dev")).toBeNull();
		expect(mapRouteToAction("POST", "/api/unknown/path")).toBeNull();
	});

	test("extractResourceId extracts stack and token identifiers", () => {
		expect(extractResourceId("/api/stacks/org/proj/dev")).toBe("org/proj/dev");
		expect(extractResourceId("/api/stacks/org/proj/dev/update/u1/cancel")).toBe("org/proj/dev");
		expect(extractResourceId("/api/orgs/org/tokens")).toBe("org");
		expect(extractResourceId("/api/orgs/org/tokens/tok1")).toBe("org/tok1");
	});

	test("action constants are strings", () => {
		for (const value of Object.values(AuditAction)) {
			expect(typeof value).toBe("string");
		}
	});

	test("mapActionToType maps destructive actions to warn", () => {
		expect(mapActionToType("stack.delete")).toBe("warn");
		expect(mapActionToType("token.revoke")).toBe("warn");
		expect(mapActionToType("update.cancel")).toBe("warn");
		expect(mapActionToType("stack.create")).toBe("info");
	});

	test("mapRouteToAction maps webhook routes", () => {
		expect(mapRouteToAction("POST", "/api/orgs/org/hooks")).toBe(AuditAction.WEBHOOK_CREATE);
		expect(mapRouteToAction("DELETE", "/api/orgs/org/hooks/h1")).toBe(AuditAction.WEBHOOK_DELETE);
	});

	test("extractResourceType identifies resource types", () => {
		expect(extractResourceType("/api/stacks/org/proj/dev")).toBe("stack");
		expect(extractResourceType("/api/stacks/org/proj/dev/update/u1")).toBe("update");
		expect(extractResourceType("/api/orgs/org/tokens")).toBe("token");
		expect(extractResourceType("/api/orgs/org/tokens/tok1")).toBe("token");
		expect(extractResourceType("/api/orgs/org/hooks")).toBe("webhook");
		expect(extractResourceType("/api/orgs/org/hooks/h1")).toBe("webhook");
		expect(extractResourceType("/api/unknown")).toBe("unknown");
	});

	test("extractResourceId falls back to path for unknown patterns", () => {
		expect(extractResourceId("/api/unknown/path")).toBe("/api/unknown/path");
	});

	test("mapActionToType returns info for non-destructive actions", () => {
		expect(mapActionToType("stack.update")).toBe("info");
		expect(mapActionToType("stack.import")).toBe("info");
		expect(mapActionToType("token.create")).toBe("info");
		expect(mapActionToType("webhook.create")).toBe("info");
		expect(mapActionToType("webhook.delete")).toBe("warn");
	});
});
