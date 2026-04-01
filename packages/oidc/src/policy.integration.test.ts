// Integration tests for PostgresTrustPolicyRepository.
// Requires a running PostgreSQL instance (uses TEST_DB_URL or default).
// Run with: bun test packages/oidc/src/policy.integration.test.ts

// Skip in unit test runs — this test requires a real PostgreSQL instance.
// Run explicitly: bun test packages/oidc/src/policy.integration.test.ts
// Or via: bun run test:integration
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Database } from "@procella/db";
import { createDb } from "@procella/db";
import { oidcTrustPolicies } from "@procella/db/src/schema.js";
import { eq } from "drizzle-orm";
import { PostgresTrustPolicyRepository } from "./policy.js";

const TEST_DB_URL =
	process.env.PROCELLA_DATABASE_URL ||
	"postgres://procella:procella@localhost:5432/procella?sslmode=disable";

let db: Database;
let closeDb: () => Promise<void>;
let repo: PostgresTrustPolicyRepository;

const TENANT_ID = "integration-test-tenant";
const ORG_SLUG = "integration-test-org";

const SKIP_INTEGRATION =
	process.env.SKIP_INTEGRATION_TESTS === "true" ||
	(process.env.CI === "true" && !process.env.PROCELLA_DATABASE_URL);

const describe_db = SKIP_INTEGRATION ? describe.skip : describe;

beforeAll(async () => {
	if (SKIP_INTEGRATION) return;
	const result = await createDb({ url: TEST_DB_URL, max: 2 });
	db = result.db;
	closeDb = async () => result.client.close();
	repo = new PostgresTrustPolicyRepository(db);
	// Clean up any leftover test data
	await db.delete(oidcTrustPolicies).where(eq(oidcTrustPolicies.tenantId, TENANT_ID));
});

afterAll(async () => {
	// Clean up test data
	await db
		.delete(oidcTrustPolicies)
		.where(eq(oidcTrustPolicies.tenantId, TENANT_ID))
		.catch(() => {});
	await closeDb();
});

describe_db("PostgresTrustPolicyRepository", () => {
	let createdId: string;

	test("create inserts a policy and returns it with generated id", async () => {
		const policy = await repo.create({
			tenantId: TENANT_ID,
			orgSlug: ORG_SLUG,
			provider: "github-actions",
			displayName: "Test Policy",
			issuer: "https://token.actions.githubusercontent.com",
			maxExpiration: 3600,
			claimConditions: { repository_owner_id: "12345" },
			grantedRole: "member",
			active: true,
		});

		expect(policy.id).toBeString();
		expect(policy.id.length).toBeGreaterThan(0);
		expect(policy.tenantId).toBe(TENANT_ID);
		expect(policy.orgSlug).toBe(ORG_SLUG);
		expect(policy.provider).toBe("github-actions");
		expect(policy.displayName).toBe("Test Policy");
		expect(policy.issuer).toBe("https://token.actions.githubusercontent.com");
		expect(policy.maxExpiration).toBe(3600);
		expect(policy.claimConditions).toEqual({ repository_owner_id: "12345" });
		expect(policy.grantedRole).toBe("member");
		expect(policy.active).toBe(true);
		expect(policy.createdAt).toBeInstanceOf(Date);

		createdId = policy.id;
	});

	test("findByOrgSlug returns active policies for the org", async () => {
		const policies = await repo.findByOrgSlug(ORG_SLUG);
		expect(policies).toBeArray();
		const found = policies.find((p) => p.id === createdId);
		expect(found).toBeDefined();
		expect(found?.displayName).toBe("Test Policy");
	});

	test("findByOrgSlug does not return policies for different org", async () => {
		const policies = await repo.findByOrgSlug("some-other-org");
		const found = policies.find((p) => p.id === createdId);
		expect(found).toBeUndefined();
	});

	test("update patches allowed fields and enforces tenant isolation", async () => {
		const updated = await repo.update(createdId, TENANT_ID, {
			displayName: "Updated Policy",
			maxExpiration: 7200,
			active: false,
		});

		expect(updated.id).toBe(createdId);
		expect(updated.displayName).toBe("Updated Policy");
		expect(updated.maxExpiration).toBe(7200);
		expect(updated.active).toBe(false);
		// Unchanged fields
		expect(updated.issuer).toBe("https://token.actions.githubusercontent.com");
		expect(updated.claimConditions).toEqual({ repository_owner_id: "12345" });
	});

	test("findByOrgSlug excludes inactive policies", async () => {
		// Policy was set inactive in previous test
		const policies = await repo.findByOrgSlug(ORG_SLUG);
		const found = policies.find((p) => p.id === createdId);
		expect(found).toBeUndefined(); // inactive — should not appear
	});

	test("listByOrgSlug returns inactive policies too", async () => {
		// Policy is still inactive from previous test
		const all = await repo.listByOrgSlug(ORG_SLUG);
		const found = all.find((p) => p.id === createdId);
		expect(found).toBeDefined();
		expect(found?.active).toBe(false);
	});

	test("update returns error when policy not found for tenant", async () => {
		await expect(
			repo.update(createdId, "wrong-tenant", { displayName: "Should Fail" }),
		).rejects.toThrow();
	});

	test("delete removes the policy", async () => {
		// Re-enable the policy first via raw update
		await repo.update(createdId, TENANT_ID, { active: true });
		await repo.delete(createdId, TENANT_ID);

		const policies = await repo.findByOrgSlug(ORG_SLUG);
		const found = policies.find((p) => p.id === createdId);
		expect(found).toBeUndefined();
	});

	test("delete is tenant-scoped (cannot delete other tenant's policy)", async () => {
		// Create a new policy to attempt deletion
		const policy = await repo.create({
			tenantId: TENANT_ID,
			orgSlug: ORG_SLUG,
			provider: "github-actions",
			displayName: "Delete Isolation Test",
			issuer: "https://token.actions.githubusercontent.com",
			maxExpiration: 3600,
			claimConditions: {},
			grantedRole: "viewer",
			active: true,
		});

		// Delete with wrong tenant — should silently not delete (no error, no rows)
		await repo.delete(policy.id, "wrong-tenant");

		// Verify still exists
		const policies = await repo.findByOrgSlug(ORG_SLUG);
		const found = policies.find((p) => p.id === policy.id);
		expect(found).toBeDefined();

		// Cleanup
		await repo.delete(policy.id, TENANT_ID);
	});
});
