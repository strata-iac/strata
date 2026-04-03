import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Database } from "@procella/db";
import { Role } from "@procella/types";
import { PostgresTrustPolicyRepository } from "./policy.js";
import type { OidcTrustPolicy } from "./types.js";

type PolicyRow = {
	id: string;
	tenantId: string;
	orgSlug: string;
	provider: string;
	displayName: string;
	issuer: string;
	maxExpiration: number;
	claimConditions: Record<string, string>;
	grantedRole: Role;
	active: boolean;
	createdAt: Date;
	updatedAt: Date;
};

function makeRow(overrides: Partial<PolicyRow> = {}): PolicyRow {
	return {
		id: "policy-1",
		tenantId: "tenant-1",
		orgSlug: "acme",
		provider: "github-actions",
		displayName: "Test Policy",
		issuer: "https://token.actions.githubusercontent.com",
		maxExpiration: 3600,
		claimConditions: { repository: "acme/procella" },
		grantedRole: Role.Member,
		active: true,
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		updatedAt: new Date("2026-01-01T00:00:00.000Z"),
		...overrides,
	};
}

function createMockDb(options?: {
	selectRows?: PolicyRow[];
	insertRows?: PolicyRow[];
	updateRows?: PolicyRow[];
}) {
	const calls: { method: string; args?: unknown }[] = [];

	const mockSelectWhere = mock((condition: unknown) => {
		calls.push({ method: "select.where", args: condition });
		return Promise.resolve(options?.selectRows ?? []);
	});
	const mockSelectFrom = mock((table: unknown) => {
		calls.push({ method: "select.from", args: table });
		return { where: mockSelectWhere };
	});
	const mockSelect = mock(() => {
		calls.push({ method: "select" });
		return { from: mockSelectFrom };
	});

	const mockInsertReturning = mock(() => {
		calls.push({ method: "insert.returning" });
		return Promise.resolve(options?.insertRows ?? []);
	});
	const mockInsertValues = mock((values: unknown) => {
		calls.push({ method: "insert.values", args: values });
		return { returning: mockInsertReturning };
	});
	const mockInsert = mock((table: unknown) => {
		calls.push({ method: "insert", args: table });
		return { values: mockInsertValues };
	});

	const mockUpdateReturning = mock(() => {
		calls.push({ method: "update.returning" });
		return Promise.resolve(options?.updateRows ?? []);
	});
	const mockUpdateWhere = mock((condition: unknown) => {
		calls.push({ method: "update.where", args: condition });
		return { returning: mockUpdateReturning };
	});
	const mockUpdateSet = mock((data: unknown) => {
		calls.push({ method: "update.set", args: data });
		return { where: mockUpdateWhere };
	});
	const mockUpdate = mock((table: unknown) => {
		calls.push({ method: "update", args: table });
		return { set: mockUpdateSet };
	});

	const mockDeleteWhere = mock((condition: unknown) => {
		calls.push({ method: "delete.where", args: condition });
		return Promise.resolve();
	});
	const mockDelete = mock((table: unknown) => {
		calls.push({ method: "delete", args: table });
		return { where: mockDeleteWhere };
	});

	const mockDb = {
		select: mockSelect,
		insert: mockInsert,
		update: mockUpdate,
		delete: mockDelete,
	};

	return {
		db: mockDb as unknown as Database,
		calls,
		mockSelectWhere,
		mockInsertReturning,
		mockUpdateReturning,
		mockDeleteWhere,
	};
}

describe("PostgresTrustPolicyRepository", () => {
	let mockRow: PolicyRow;

	beforeEach(() => {
		mockRow = makeRow();
	});

	test("findByOrgSlugAndIssuer returns mapped active policies", async () => {
		const { db } = createMockDb({ selectRows: [mockRow] });
		const repo = new PostgresTrustPolicyRepository(db);

		const result = await repo.findByOrgSlugAndIssuer(
			"acme",
			"https://token.actions.githubusercontent.com",
		);

		expect(result).toEqual<OidcTrustPolicy[]>([
			{
				id: "policy-1",
				tenantId: "tenant-1",
				orgSlug: "acme",
				provider: "github-actions",
				displayName: "Test Policy",
				issuer: "https://token.actions.githubusercontent.com",
				maxExpiration: 3600,
				claimConditions: { repository: "acme/procella" },
				grantedRole: Role.Member,
				active: true,
				createdAt: new Date("2026-01-01T00:00:00.000Z"),
				updatedAt: new Date("2026-01-01T00:00:00.000Z"),
			},
		]);
	});

	test("findByOrgSlug works with and without tenantId", async () => {
		const rows = [mockRow];
		const withTenant = createMockDb({ selectRows: rows });
		const withoutTenant = createMockDb({ selectRows: rows });

		const withTenantRepo = new PostgresTrustPolicyRepository(withTenant.db);
		const withoutTenantRepo = new PostgresTrustPolicyRepository(withoutTenant.db);

		const withTenantResult = await withTenantRepo.findByOrgSlug("acme", "tenant-1");
		const withoutTenantResult = await withoutTenantRepo.findByOrgSlug("acme");

		expect(withTenantResult).toHaveLength(1);
		expect(withoutTenantResult).toHaveLength(1);
		expect(withTenant.mockSelectWhere).toHaveBeenCalledTimes(1);
		expect(withoutTenant.mockSelectWhere).toHaveBeenCalledTimes(1);
	});

	test("listByOrgSlug works with and without tenantId and returns active+inactive", async () => {
		const rows = [
			mockRow,
			makeRow({ id: "policy-2", active: false, displayName: "Inactive Policy" }),
		];
		const withTenant = createMockDb({ selectRows: rows });
		const withoutTenant = createMockDb({ selectRows: rows });

		const withTenantRepo = new PostgresTrustPolicyRepository(withTenant.db);
		const withoutTenantRepo = new PostgresTrustPolicyRepository(withoutTenant.db);

		const withTenantResult = await withTenantRepo.listByOrgSlug("acme", "tenant-1");
		const withoutTenantResult = await withoutTenantRepo.listByOrgSlug("acme");

		expect(withTenantResult).toHaveLength(2);
		expect(withoutTenantResult).toHaveLength(2);
		expect(withTenantResult.map((p) => p.active)).toEqual([true, false]);
		expect(withTenant.mockSelectWhere).toHaveBeenCalledTimes(1);
		expect(withoutTenant.mockSelectWhere).toHaveBeenCalledTimes(1);
	});

	test("create returns mapped row and runs stale cleanup before insert", async () => {
		const { db, calls } = createMockDb({ insertRows: [mockRow] });
		const repo = new PostgresTrustPolicyRepository(db);

		const result = await repo.create({
			tenantId: "tenant-1",
			orgSlug: "acme",
			provider: "github-actions",
			displayName: "Test Policy",
			issuer: "https://token.actions.githubusercontent.com",
			maxExpiration: 3600,
			claimConditions: { repository: "acme/procella" },
			grantedRole: Role.Member,
			active: true,
		});

		expect(result.id).toBe("policy-1");
		const deleteWhereIndex = calls.findIndex((call) => call.method === "delete.where");
		const insertReturningIndex = calls.findIndex((call) => call.method === "insert.returning");
		expect(deleteWhereIndex).toBeGreaterThanOrEqual(0);
		expect(insertReturningIndex).toBeGreaterThan(deleteWhereIndex);
	});

	test("create throws when insert returns empty array", async () => {
		const { db } = createMockDb({ insertRows: [] });
		const repo = new PostgresTrustPolicyRepository(db);

		expect(
			repo.create({
				tenantId: "tenant-1",
				orgSlug: "acme",
				provider: "github-actions",
				displayName: "Test Policy",
				issuer: "https://token.actions.githubusercontent.com",
				maxExpiration: 3600,
				claimConditions: { repository: "acme/procella" },
				grantedRole: Role.Member,
				active: true,
			}),
		).rejects.toThrow("Failed to create trust policy");
	});

	test("update returns mapped row", async () => {
		const { db, calls } = createMockDb({ updateRows: [mockRow] });
		const repo = new PostgresTrustPolicyRepository(db);

		const result = await repo.update("policy-1", "tenant-1", {
			displayName: "Renamed Policy",
			active: false,
		});

		expect(result.id).toBe("policy-1");
		expect(result.grantedRole).toBe(Role.Member);
		expect(calls.some((call) => call.method === "update.set")).toBe(true);
	});

	test("update throws when policy is not found", async () => {
		const { db } = createMockDb({ updateRows: [] });
		const repo = new PostgresTrustPolicyRepository(db);

		expect(repo.update("missing-policy", "tenant-1", { active: false })).rejects.toThrow(
			"Trust policy missing-policy not found",
		);
	});

	test("delete does not throw", async () => {
		const { db, mockDeleteWhere } = createMockDb();
		const repo = new PostgresTrustPolicyRepository(db);

		await expect(repo.delete("policy-1", "tenant-1")).resolves.toBeUndefined();
		expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
	});
});
