import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { AesCryptoService } from "@procella/crypto";
import { createDb, escProjects, escSessions } from "@procella/db";
import { ConflictError, NotFoundError } from "@procella/types";
import { eq } from "drizzle-orm";
import type { EvaluatePayload, EvaluateResult, EvaluatorClient } from "./evaluator-client.js";
import { UnimplementedEvaluatorClient } from "./evaluator-client.js";
import { EscEvaluationError, PostgresEscService } from "./service.js";

const DB_URL =
	process.env.PROCELLA_TEST_DATABASE_URL ??
	process.env.PROCELLA_DATABASE_URL ??
	"postgres://procella:procella@localhost:5432/procella";

const hasDb = async (): Promise<boolean> => {
	try {
		const { db, client } = await createDb({ url: DB_URL });
		await db.select().from(escProjects).limit(1);
		await client.close();
		return true;
	} catch {
		return false;
	}
};

describe.skipIf(!(await hasDb()))("PostgresEscService", () => {
	const tenant = `t-${crypto.randomUUID().slice(0, 8)}`;
	const user = "test-user";
	const evaluator = new UnimplementedEvaluatorClient();
	const encryptionKeyHex = "00".repeat(32);

	let service: PostgresEscService;
	let dbClient: { close(): Promise<void> };

	beforeAll(async () => {
		const { db, client } = await createDb({ url: DB_URL });
		dbClient = client;
		service = new PostgresEscService({ db, evaluator, encryptionKeyHex });
	});

	afterAll(async () => {
		await dbClient.close();
	});

	beforeEach(async () => {
		const { db, client } = await createDb({ url: DB_URL });
		try {
			await db.delete(escProjects).where(eq(escProjects.tenantId, tenant));
		} finally {
			await client.close();
		}
	});

	test("createEnvironment auto-creates project and first revision", async () => {
		const env = await service.createEnvironment(
			tenant,
			{ projectName: "demo", name: "dev", yamlBody: "values:\n  foo: bar\n" },
			user,
		);
		expect(env.name).toBe("dev");
		expect(env.currentRevisionNumber).toBe(1);
		expect(env.yamlBody).toContain("foo: bar");

		const list = await service.listEnvironments(tenant, "demo");
		expect(list.map((e) => e.name)).toEqual(["dev"]);

		const revs = await service.listRevisions(tenant, "demo", "dev");
		expect(revs).toHaveLength(1);
		expect(revs[0].revisionNumber).toBe(1);
	});

	test("createEnvironment rejects duplicates with ConflictError", async () => {
		await service.createEnvironment(
			tenant,
			{ projectName: "demo", name: "dev2", yamlBody: "values: {}" },
			user,
		);
		await expect(
			service.createEnvironment(
				tenant,
				{ projectName: "demo", name: "dev2", yamlBody: "values: {}" },
				user,
			),
		).rejects.toBeInstanceOf(ConflictError);
	});

	test("updateEnvironment creates new revision and bumps number", async () => {
		await service.createEnvironment(
			tenant,
			{ projectName: "demo", name: "staging", yamlBody: "values: {a: 1}" },
			user,
		);
		const updated = await service.updateEnvironment(
			tenant,
			"demo",
			"staging",
			{ yamlBody: "values: {a: 2}" },
			user,
		);
		expect(updated.currentRevisionNumber).toBe(2);
		expect(updated.yamlBody).toContain("a: 2");

		const revs = await service.listRevisions(tenant, "demo", "staging");
		expect(revs.map((r) => r.revisionNumber)).toEqual([2, 1]);

		const rev1 = await service.getRevision(tenant, "demo", "staging", 1);
		expect(rev1?.yamlBody).toContain("a: 1");
	});

	test("updateEnvironment throws NotFoundError for missing env", async () => {
		await expect(
			service.updateEnvironment(tenant, "nope", "gone", { yamlBody: "values: {}" }, user),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	test("deleteEnvironment soft-deletes and hides from list", async () => {
		await service.createEnvironment(
			tenant,
			{ projectName: "demo", name: "doomed", yamlBody: "values: {}" },
			user,
		);
		await service.deleteEnvironment(tenant, "demo", "doomed");
		const list = await service.listEnvironments(tenant, "demo");
		expect(list.find((e) => e.name === "doomed")).toBeUndefined();

		const fetch = await service.getEnvironment(tenant, "demo", "doomed");
		expect(fetch).toBeNull();
	});

	test("can recreate env with same name after soft-delete", async () => {
		await service.createEnvironment(
			tenant,
			{ projectName: "demo", name: "recycler", yamlBody: "values: {v: 1}" },
			user,
		);
		await service.deleteEnvironment(tenant, "demo", "recycler");
		const recreated = await service.createEnvironment(
			tenant,
			{ projectName: "demo", name: "recycler", yamlBody: "values: {v: 2}" },
			user,
		);
		expect(recreated.currentRevisionNumber).toBe(1);
	});

	test("validates env/project names", async () => {
		await expect(
			service.createEnvironment(
				tenant,
				{ projectName: "demo", name: "bad name with spaces", yamlBody: "values: {}" },
				user,
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	test("concurrent updateEnvironment serializes via SELECT FOR UPDATE (no duplicate revision)", async () => {
		await service.createEnvironment(
			tenant,
			{ projectName: "race", name: "env", yamlBody: "values: {n: 0}" },
			user,
		);
		const results = await Promise.allSettled([
			service.updateEnvironment(tenant, "race", "env", { yamlBody: "values: {n: 1}" }, user),
			service.updateEnvironment(tenant, "race", "env", { yamlBody: "values: {n: 2}" }, user),
		]);
		const fulfilled = results.filter((r) => r.status === "fulfilled");
		expect(fulfilled).toHaveLength(2);

		const revs = await service.listRevisions(tenant, "race", "env");
		const nums = revs.map((r) => r.revisionNumber).sort((a, b) => a - b);
		expect(nums).toEqual([1, 2, 3]);
	});

	test("concurrent deleteEnvironment is idempotent-safe (transaction + isNull guard)", async () => {
		await service.createEnvironment(
			tenant,
			{ projectName: "delrace", name: "env", yamlBody: "values: {}" },
			user,
		);
		const results = await Promise.allSettled([
			service.deleteEnvironment(tenant, "delrace", "env"),
			service.deleteEnvironment(tenant, "delrace", "env"),
		]);
		const fulfilled = results.filter((r) => r.status === "fulfilled").length;
		const rejected = results.filter((r) => r.status === "rejected").length;
		expect(fulfilled).toBeGreaterThanOrEqual(1);
		expect(fulfilled + rejected).toBe(2);

		const fetch = await service.getEnvironment(tenant, "delrace", "env");
		expect(fetch).toBeNull();
	});

	test("tenant isolation — other tenant cannot see envs", async () => {
		await service.createEnvironment(
			tenant,
			{ projectName: "iso", name: "dev", yamlBody: "values: {secret: 1}" },
			user,
		);
		const otherTenant = `t-other-${crypto.randomUUID().slice(0, 6)}`;
		const list = await service.listEnvironments(otherTenant, "iso");
		expect(list).toEqual([]);
		const fetch = await service.getEnvironment(otherTenant, "iso", "dev");
		expect(fetch).toBeNull();
	});
});

// ============================================================================
// Session tests — openSession / getSession with mocked evaluator
// ============================================================================

class MockEvaluatorClient implements EvaluatorClient {
	lastPayload: EvaluatePayload | null = null;
	result: EvaluateResult = { values: { foo: "bar" }, secrets: [], diagnostics: [] };

	async evaluate(payload: EvaluatePayload): Promise<EvaluateResult> {
		this.lastPayload = payload;
		return this.result;
	}
}

describe.skipIf(!(await hasDb()))("PostgresEscService — sessions", () => {
	const tenant = `t-sess-${crypto.randomUUID().slice(0, 8)}`;
	const user = "test-user";
	const encryptionKeyHex = "00".repeat(32);

	let mockEval: MockEvaluatorClient;
	let service: PostgresEscService;
	let dbClient: { close(): Promise<void> };

	beforeAll(async () => {
		const { db, client } = await createDb({ url: DB_URL });
		dbClient = client;
		mockEval = new MockEvaluatorClient();
		service = new PostgresEscService({
			db,
			evaluator: mockEval,
			encryptionKeyHex,
		});
	});

	afterAll(async () => {
		await dbClient.close();
	});

	beforeEach(async () => {
		const { db, client } = await createDb({ url: DB_URL });
		try {
			mockEval.result = { values: { foo: "bar" }, secrets: [], diagnostics: [] };
			mockEval.lastPayload = null;
			await db.delete(escProjects).where(eq(escProjects.tenantId, tenant));
		} finally {
			await client.close();
		}
	});

	test("openSession stores encrypted ciphertext + returns values inline", async () => {
		await service.createEnvironment(
			tenant,
			{ projectName: "proj", name: "dev", yamlBody: "values:\n  foo: bar\n" },
			user,
		);

		const result = await service.openSession(tenant, "proj", "dev");

		expect(result.sessionId).toBeTruthy();
		expect(result.values).toEqual({ foo: "bar" });
		expect(result.secrets).toEqual([]);
		expect(result.expiresAt).toBeInstanceOf(Date);
		expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

		const { db: verifyDb, client: verifyClient } = await createDb({ url: DB_URL });
		try {
			const [row] = await verifyDb
				.select()
				.from(escSessions)
				.where(eq(escSessions.id, result.sessionId))
				.limit(1);
			expect(row).toBeTruthy();
			expect(row.resolvedValuesCiphertext).toBeTruthy();
			expect(row.resolvedValuesCiphertext).not.toContain("foo");

			const cryptoSvc = new AesCryptoService(encryptionKeyHex);
			const envFQN = `${tenant}/proj/dev`;
			const cipherBytes = Buffer.from(row.resolvedValuesCiphertext, "base64");
			const plainBytes = await cryptoSvc.decrypt(new Uint8Array(cipherBytes), envFQN);
			const decrypted = JSON.parse(new TextDecoder().decode(plainBytes));
			expect(decrypted).toEqual({ foo: "bar" });
		} finally {
			await verifyClient.close();
		}
	});

	test("openSession collects imports recursively", async () => {
		await service.createEnvironment(
			tenant,
			{ projectName: "proj", name: "shared", yamlBody: "values:\n  x: 1\n" },
			user,
		);
		await service.createEnvironment(
			tenant,
			{
				projectName: "proj",
				name: "app",
				yamlBody: "imports:\n  - shared\nvalues:\n  y: 2\n",
			},
			user,
		);

		await service.openSession(tenant, "proj", "app");

		expect(mockEval.lastPayload).toBeTruthy();
		expect(mockEval.lastPayload?.imports).toEqual({
			"proj/shared": "values:\n  x: 1\n",
		});
	});

	test("openSession detects import cycles", async () => {
		await service.createEnvironment(
			tenant,
			{ projectName: "proj", name: "a", yamlBody: "imports:\n  - b\nvalues: {}" },
			user,
		);
		await service.createEnvironment(
			tenant,
			{ projectName: "proj", name: "b", yamlBody: "imports:\n  - a\nvalues: {}" },
			user,
		);

		await expect(service.openSession(tenant, "proj", "a")).rejects.toThrow("import_cycle");
	});

	test("openSession throws EscEvaluationError for evaluator error diagnostics", async () => {
		await service.createEnvironment(
			tenant,
			{ projectName: "proj", name: "bad", yamlBody: "values: {}" },
			user,
		);

		mockEval.result = {
			values: null as unknown as Record<string, unknown>,
			secrets: [],
			diagnostics: [{ severity: "error", summary: "unknown provider aws-login" }],
		};

		try {
			await service.openSession(tenant, "proj", "bad");
			expect.unreachable("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(EscEvaluationError);
			const evalErr = err as EscEvaluationError;
			expect(evalErr.statusCode).toBe(422);
			expect(evalErr.diagnostics).toHaveLength(1);
			expect(evalErr.diagnostics[0].summary).toContain("aws-login");
		}
	});

	test("getSession returns decrypted values for fresh session", async () => {
		await service.createEnvironment(
			tenant,
			{ projectName: "proj", name: "fresh", yamlBody: "values:\n  key: value\n" },
			user,
		);
		mockEval.result = { values: { key: "value" }, secrets: ["key"], diagnostics: [] };

		const opened = await service.openSession(tenant, "proj", "fresh");
		const fetched = await service.getSession(tenant, "proj", "fresh", opened.sessionId);

		expect(fetched).not.toBeNull();
		expect(fetched?.sessionId).toBe(opened.sessionId);
		expect(fetched?.values).toEqual({ key: "value" });
		expect(fetched?.secrets).toEqual(["key"]);
		expect(fetched?.expiresAt.getTime()).toBe(opened.expiresAt.getTime());
	});

	test("getSession returns null for expired session", async () => {
		const { db: shortDb, client: shortClient } = await createDb({ url: DB_URL });
		const shortTtlService = new PostgresEscService({
			db: shortDb,
			evaluator: mockEval,
			encryptionKeyHex,
			sessionTtlSeconds: 0,
		});

		await service.createEnvironment(
			tenant,
			{ projectName: "proj", name: "expiry", yamlBody: "values: {}" },
			user,
		);

		const opened = await shortTtlService.openSession(tenant, "proj", "expiry");
		await new Promise((r) => setTimeout(r, 50));
		const fetched = await shortTtlService.getSession(tenant, "proj", "expiry", opened.sessionId);
		expect(fetched).toBeNull();
		await shortClient.close();
	});

	test("getSession returns null for closed session", async () => {
		await service.createEnvironment(
			tenant,
			{ projectName: "proj", name: "closed", yamlBody: "values: {}" },
			user,
		);

		const opened = await service.openSession(tenant, "proj", "closed");

		const { db: updateDb, client: updateClient } = await createDb({ url: DB_URL });
		try {
			await updateDb
				.update(escSessions)
				.set({ closedAt: new Date() })
				.where(eq(escSessions.id, opened.sessionId));
		} finally {
			await updateClient.close();
		}

		const fetched = await service.getSession(tenant, "proj", "closed", opened.sessionId);
		expect(fetched).toBeNull();
	});

	test("getSession returns null for unknown sessionId", async () => {
		await service.createEnvironment(
			tenant,
			{ projectName: "proj", name: "missing", yamlBody: "values: {}" },
			user,
		);

		const fetched = await service.getSession(tenant, "proj", "missing", crypto.randomUUID());
		expect(fetched).toBeNull();
	});
});
