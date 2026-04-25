import { describe, expect, mock, test } from "bun:test";
import type { EscDraft, EscEnvironment, EscEnvironmentRevision, EscService } from "@procella/esc";
import type { Caller } from "@procella/types";
import { Hono } from "hono";
import type { Env } from "../types.js";
import { escHandlers } from "./esc.js";

const validCaller: Caller = {
	tenantId: "t-1",
	orgSlug: "my-org",
	userId: "u-1",
	login: "test-user",
	roles: ["admin"],
	principalType: "user",
};

const now = new Date("2025-01-01");

const mockEnv: EscEnvironment = {
	id: "env-1",
	projectId: "proj-1",
	name: "staging",
	yamlBody: "values:\n  key: val",
	currentRevisionNumber: 1,
	createdBy: "u-1",
	createdAt: now,
	updatedAt: now,
};

const mockRevision: EscEnvironmentRevision = {
	id: "rev-1",
	environmentId: "env-1",
	revisionNumber: 1,
	yamlBody: "values:\n  key: val",
	createdBy: "u-1",
	createdAt: now,
};

const mockDraft: EscDraft = {
	id: "draft-1",
	environmentId: "env-1",
	yamlBody: "values:\n  key: new-val",
	description: "test draft",
	createdBy: "u-1",
	status: "open",
	appliedRevisionId: null,
	appliedAt: null,
	createdAt: now,
	updatedAt: now,
};

function mockEscService(overrides?: Partial<EscService>): EscService {
	return {
		listProjects: mock(async () => []),
		createEnvironment: mock(async () => mockEnv),
		listEnvironments: mock(async () => [mockEnv]),
		getEnvironment: mock(async () => mockEnv),
		updateEnvironment: mock(async () => mockEnv),
		deleteEnvironment: mock(async () => {}),
		listRevisions: mock(async () => [mockRevision]),
		getRevision: mock(async () => mockRevision),
		openSession: mock(async () => ({
			sessionId: "sess-1",
			values: { key: "val" },
			secrets: [],
			expiresAt: new Date("2025-01-02"),
		})),
		getSession: mock(async () => ({
			sessionId: "sess-1",
			values: { key: "val" },
			secrets: [],
			expiresAt: new Date("2025-01-02"),
		})),
		gcSweep: mock(async () => ({ closedCount: 0 })),
		listRevisionTags: mock(async () => []),
		tagRevision: mock(async () => {}),
		untagRevision: mock(async () => {}),
		getEnvironmentTags: mock(async () => ({})),
		setEnvironmentTags: mock(async () => {}),
		updateEnvironmentTags: mock(async () => {}),
		createDraft: mock(async () => mockDraft),
		listDrafts: mock(async () => [mockDraft]),
		getDraft: mock(async () => mockDraft),
		applyDraft: mock(async () => ({ ...mockDraft, status: "applied" as const })),
		discardDraft: mock(async () => {}),
		...overrides,
	};
}

function injectCaller(caller: Caller) {
	return async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
		c.set("caller", caller);
		await next();
	};
}

function createTestApp(esc: EscService) {
	const app = new Hono<Env>();
	app.use("*", injectCaller(validCaller));
	app.onError((err, c) => {
		const status =
			"statusCode" in err && typeof err.statusCode === "number"
				? err.statusCode
				: err.message.includes("does not match")
					? 400
					: err.message.includes("not found")
						? 404
						: 500;
		return c.json({ error: err.message }, status as 400 | 404 | 500);
	});
	const h = escHandlers({ esc });
	app.post("/esc/environments/:org/:project", h.createEnvironment);
	app.get("/esc/environments/:org/:project", h.listEnvironments);
	app.get("/esc/environments/:org/:project/:envName", h.getEnvironment);
	app.patch("/esc/environments/:org/:project/:envName", h.updateEnvironment);
	app.delete("/esc/environments/:org/:project/:envName", h.deleteEnvironment);
	app.get("/esc/environments/:org/:project/:envName/versions", h.listRevisions);
	app.get("/esc/environments/:org/:project/:envName/versions/tags", h.listRevisionTags);
	app.delete("/esc/environments/:org/:project/:envName/versions/tags/:tagName", h.untagRevision);
	app.put(
		"/esc/environments/:org/:project/:envName/versions/:version/tags/:tagName",
		h.tagRevision,
	);
	app.get("/esc/environments/:org/:project/:envName/versions/:version", h.getRevision);
	app.post("/esc/environments/:org/:project/:envName/open", h.openSession);
	app.get("/esc/environments/:org/:project/:envName/open/:sessionId", h.getSession);
	app.get("/esc/environments/:org/:project/:envName/tags", h.getEnvironmentTags);
	app.put("/esc/environments/:org/:project/:envName/tags", h.setEnvironmentTags);
	app.patch("/esc/environments/:org/:project/:envName/tags", h.updateEnvironmentTags);
	app.post("/esc/environments/:org/:project/:envName/drafts", h.createDraft);
	app.get("/esc/environments/:org/:project/:envName/drafts", h.listDrafts);
	app.get("/esc/environments/:org/:project/:envName/drafts/:draftId", h.getDraft);
	app.post("/esc/environments/:org/:project/:envName/drafts/:draftId/apply", h.applyDraft);
	app.post("/esc/environments/:org/:project/:envName/drafts/:draftId/discard", h.discardDraft);
	return app;
}

describe("escHandlers", () => {
	describe("createEnvironment", () => {
		test("returns 201 with created environment", async () => {
			const esc = mockEscService();
			const app = createTestApp(esc);

			const res = await app.request("/esc/environments/my-org/myproj", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "staging", yamlBody: "values:\n  key: val" }),
			});
			expect(res.status).toBe(201);
			const body = await res.json();
			expect(body.name).toBe("staging");
			expect(esc.createEnvironment).toHaveBeenCalledTimes(1);
		});
	});

	describe("listEnvironments", () => {
		test("returns 200 with environments array", async () => {
			const esc = mockEscService();
			const app = createTestApp(esc);

			const res = await app.request("/esc/environments/my-org/myproj");
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.environments).toBeArray();
			expect(body.environments).toHaveLength(1);
		});
	});

	describe("getEnvironment", () => {
		test("returns 200 for existing environment", async () => {
			const esc = mockEscService();
			const app = createTestApp(esc);

			const res = await app.request("/esc/environments/my-org/myproj/staging");
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.name).toBe("staging");
		});

		test("returns 404 for missing environment", async () => {
			const esc = mockEscService({
				getEnvironment: mock(async () => null),
			});
			const app = createTestApp(esc);

			const res = await app.request("/esc/environments/my-org/myproj/missing");
			expect(res.status).toBe(404);
		});
	});

	describe("updateEnvironment", () => {
		test("returns 200 with updated environment", async () => {
			const esc = mockEscService();
			const app = createTestApp(esc);

			const res = await app.request("/esc/environments/my-org/myproj/staging", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ yamlBody: "values:\n  key: new-val" }),
			});
			expect(res.status).toBe(200);
			expect(esc.updateEnvironment).toHaveBeenCalledTimes(1);
		});
	});

	describe("deleteEnvironment", () => {
		test("returns 204", async () => {
			const esc = mockEscService();
			const app = createTestApp(esc);

			const res = await app.request("/esc/environments/my-org/myproj/staging", {
				method: "DELETE",
			});
			expect(res.status).toBe(204);
			expect(esc.deleteEnvironment).toHaveBeenCalledTimes(1);
		});
	});

	describe("getRevision", () => {
		test("returns 404 for missing revision", async () => {
			const esc = mockEscService({
				getRevision: mock(async () => null),
			});
			const app = createTestApp(esc);

			const res = await app.request("/esc/environments/my-org/myproj/staging/versions/99");
			expect(res.status).toBe(404);
		});
	});

	describe("openSession", () => {
		test("returns 201 with session", async () => {
			const esc = mockEscService();
			const app = createTestApp(esc);

			const res = await app.request("/esc/environments/my-org/myproj/staging/open", {
				method: "POST",
			});
			expect(res.status).toBe(201);
			const body = await res.json();
			expect(body.sessionId).toBe("sess-1");
		});

		test("surfaces service errors", async () => {
			const esc = mockEscService({
				openSession: mock(async () => {
					throw new Error("openSession not implemented");
				}),
			});
			const app = createTestApp(esc);

			const res = await app.request("/esc/environments/my-org/myproj/staging/open", {
				method: "POST",
			});
			expect(res.status).toBe(500);
		});
	});

	describe("org mismatch", () => {
		test("returns 400 when org does not match caller", async () => {
			const esc = mockEscService();
			const app = createTestApp(esc);

			const res = await app.request("/esc/environments/wrong-org/myproj");
			expect(res.status).toBe(400);
		});
	});

	describe("listRevisionTags", () => {
		test("returns 200 with tags array", async () => {
			const esc = mockEscService();
			const app = createTestApp(esc);
			const res = await app.request("/esc/environments/my-org/myproj/staging/versions/tags");
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.tags).toBeArray();
		});
	});

	describe("tagRevision", () => {
		test("returns 204 on success", async () => {
			const esc = mockEscService();
			const app = createTestApp(esc);
			const res = await app.request(
				"/esc/environments/my-org/myproj/staging/versions/1/tags/stable",
				{ method: "PUT" },
			);
			expect(res.status).toBe(204);
			expect(esc.tagRevision).toHaveBeenCalledTimes(1);
		});
	});

	describe("untagRevision", () => {
		test("returns 204 on success", async () => {
			const esc = mockEscService();
			const app = createTestApp(esc);
			const res = await app.request(
				"/esc/environments/my-org/myproj/staging/versions/tags/stable",
				{ method: "DELETE" },
			);
			expect(res.status).toBe(204);
			expect(esc.untagRevision).toHaveBeenCalledTimes(1);
		});
	});

	describe("getEnvironmentTags", () => {
		test("returns 200 with tags object", async () => {
			const esc = mockEscService();
			const app = createTestApp(esc);
			const res = await app.request("/esc/environments/my-org/myproj/staging/tags");
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.tags).toBeDefined();
		});
	});

	describe("setEnvironmentTags", () => {
		test("returns 204 on PUT", async () => {
			const esc = mockEscService();
			const app = createTestApp(esc);
			const res = await app.request("/esc/environments/my-org/myproj/staging/tags", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ env: "production", tier: "gold" }),
			});
			expect(res.status).toBe(204);
			expect(esc.setEnvironmentTags).toHaveBeenCalledTimes(1);
		});

		test("PUT with no body returns 400 instead of silently wiping tags", async () => {
			const esc = mockEscService();
			const app = createTestApp(esc);
			const res = await app.request("/esc/environments/my-org/myproj/staging/tags", {
				method: "PUT",
			});
			expect(res.status).toBe(400);
			expect(esc.setEnvironmentTags).not.toHaveBeenCalled();
		});

		test("PUT with empty {} body wipes tags explicitly", async () => {
			const esc = mockEscService();
			const app = createTestApp(esc);
			const res = await app.request("/esc/environments/my-org/myproj/staging/tags", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: "{}",
			});
			expect(res.status).toBe(204);
			expect(esc.setEnvironmentTags).toHaveBeenCalledTimes(1);
			expect(esc.setEnvironmentTags).toHaveBeenCalledWith("t-1", "myproj", "staging", {});
		});
	});

	describe("updateEnvironmentTags", () => {
		test("returns 204 on PATCH", async () => {
			const esc = mockEscService();
			const app = createTestApp(esc);
			const res = await app.request("/esc/environments/my-org/myproj/staging/tags", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tier: null, region: "us-west-2" }),
			});
			expect(res.status).toBe(204);
			expect(esc.updateEnvironmentTags).toHaveBeenCalledTimes(1);
		});
	});

	describe("createDraft", () => {
		test("returns 201 with draft", async () => {
			const esc = mockEscService();
			const app = createTestApp(esc);
			const res = await app.request("/esc/environments/my-org/myproj/staging/drafts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ yamlBody: "values:\n  key: new", description: "test" }),
			});
			expect(res.status).toBe(201);
			const body = await res.json();
			expect(body.id).toBe("draft-1");
		});
	});

	describe("listDrafts", () => {
		test("returns 200 with drafts array", async () => {
			const esc = mockEscService();
			const app = createTestApp(esc);
			const res = await app.request("/esc/environments/my-org/myproj/staging/drafts");
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.drafts).toBeArray();
		});

		test("returns 400 for invalid status query param", async () => {
			const esc = mockEscService();
			const app = createTestApp(esc);
			const res = await app.request(
				"/esc/environments/my-org/myproj/staging/drafts?status=invalid",
			);
			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.error).toContain("must be one of");
		});

		test("accepts valid status query param", async () => {
			const esc = mockEscService();
			const app = createTestApp(esc);
			const res = await app.request("/esc/environments/my-org/myproj/staging/drafts?status=open");
			expect(res.status).toBe(200);
			expect(esc.listDrafts).toHaveBeenCalledTimes(1);
		});
	});

	describe("getDraft", () => {
		test("returns 200 for existing draft", async () => {
			const esc = mockEscService();
			const app = createTestApp(esc);
			const res = await app.request("/esc/environments/my-org/myproj/staging/drafts/draft-1");
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.id).toBe("draft-1");
		});

		test("returns 404 for missing draft", async () => {
			const esc = mockEscService({ getDraft: mock(async () => null) });
			const app = createTestApp(esc);
			const res = await app.request("/esc/environments/my-org/myproj/staging/drafts/missing");
			expect(res.status).toBe(404);
		});
	});

	describe("applyDraft", () => {
		test("returns 200 with applied draft", async () => {
			const esc = mockEscService();
			const app = createTestApp(esc);
			const res = await app.request(
				"/esc/environments/my-org/myproj/staging/drafts/draft-1/apply",
				{ method: "POST" },
			);
			expect(res.status).toBe(200);
			expect(esc.applyDraft).toHaveBeenCalledTimes(1);
		});
	});

	describe("discardDraft", () => {
		test("returns 204 on discard", async () => {
			const esc = mockEscService();
			const app = createTestApp(esc);
			const res = await app.request(
				"/esc/environments/my-org/myproj/staging/drafts/draft-1/discard",
				{ method: "POST" },
			);
			expect(res.status).toBe(204);
			expect(esc.discardDraft).toHaveBeenCalledTimes(1);
		});
	});
});
