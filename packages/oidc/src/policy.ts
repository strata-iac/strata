import type { Database } from "@procella/db";
import { oidcTrustPolicies } from "@procella/db/src/schema.js";
import { and, eq } from "drizzle-orm";
import type { OidcTrustPolicy, TrustPolicyRepository } from "./types.js";

export class PostgresTrustPolicyRepository implements TrustPolicyRepository {
	constructor(private readonly db: Database) {}

	async findByOrgSlugAndIssuer(orgSlug: string, issuer: string): Promise<OidcTrustPolicy[]> {
		const rows = await this.db
			.select()
			.from(oidcTrustPolicies)
			.where(
				and(
					eq(oidcTrustPolicies.orgSlug, orgSlug),
					eq(oidcTrustPolicies.issuer, issuer),
					eq(oidcTrustPolicies.active, true),
				),
			);
		return rows.map(mapRow);
	}

	async findByOrgSlug(orgSlug: string, tenantId?: string): Promise<OidcTrustPolicy[]> {
		const rows = await this.db
			.select()
			.from(oidcTrustPolicies)
			.where(
				and(
					eq(oidcTrustPolicies.orgSlug, orgSlug),
					eq(oidcTrustPolicies.active, true),
					...(tenantId ? [eq(oidcTrustPolicies.tenantId, tenantId)] : []),
				),
			);
		return rows.map(mapRow);
	}

	async listByOrgSlug(orgSlug: string, tenantId?: string): Promise<OidcTrustPolicy[]> {
		const rows = await this.db
			.select()
			.from(oidcTrustPolicies)
			.where(
				tenantId
					? and(eq(oidcTrustPolicies.orgSlug, orgSlug), eq(oidcTrustPolicies.tenantId, tenantId))
					: eq(oidcTrustPolicies.orgSlug, orgSlug),
			);
		return rows.map(mapRow);
	}

	async create(
		policy: Omit<OidcTrustPolicy, "id" | "createdAt" | "updatedAt">,
	): Promise<OidcTrustPolicy> {
		const [row] = await this.db
			.insert(oidcTrustPolicies)
			.values({
				tenantId: policy.tenantId,
				orgSlug: policy.orgSlug,
				provider: policy.provider,
				displayName: policy.displayName,
				issuer: policy.issuer,
				maxExpiration: policy.maxExpiration,
				claimConditions: policy.claimConditions,
				grantedRole: policy.grantedRole,
				active: policy.active,
			})
			.returning();

		if (!row) throw new Error("Failed to create trust policy");
		return mapRow(row);
	}

	async update(
		id: string,
		tenantId: string,
		patch: Partial<
			Pick<
				OidcTrustPolicy,
				"displayName" | "claimConditions" | "grantedRole" | "maxExpiration" | "active"
			>
		>,
	): Promise<OidcTrustPolicy> {
		const [row] = await this.db
			.update(oidcTrustPolicies)
			.set({ ...patch, updatedAt: new Date() })
			.where(and(eq(oidcTrustPolicies.id, id), eq(oidcTrustPolicies.tenantId, tenantId)))
			.returning();

		if (!row) throw new Error(`Trust policy ${id} not found`);
		return mapRow(row);
	}

	async delete(id: string, tenantId: string): Promise<void> {
		await this.db
			.delete(oidcTrustPolicies)
			.where(and(eq(oidcTrustPolicies.id, id), eq(oidcTrustPolicies.tenantId, tenantId)));
	}
}

function mapRow(row: typeof oidcTrustPolicies.$inferSelect): OidcTrustPolicy {
	return {
		id: row.id,
		tenantId: row.tenantId,
		orgSlug: row.orgSlug,
		provider: row.provider,
		displayName: row.displayName,
		issuer: row.issuer,
		maxExpiration: row.maxExpiration,
		claimConditions: row.claimConditions,
		grantedRole: row.grantedRole as OidcTrustPolicy["grantedRole"],
		active: row.active,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

export function matchPolicy(policy: OidcTrustPolicy, jwtClaims: Record<string, unknown>): boolean {
	if (Object.keys(policy.claimConditions).length === 0) return false;
	for (const [key, expectedValue] of Object.entries(policy.claimConditions)) {
		const actualValue = jwtClaims[key];
		// Strict: claim must exist and be a string or number. Reject undefined/null/object.
		if (actualValue === undefined || actualValue === null) return false;
		if (typeof actualValue !== "string" && typeof actualValue !== "number") return false;
		if (String(actualValue) !== expectedValue) return false;
	}
	return true;
}

export function findMatchingPolicy(
	policies: OidcTrustPolicy[],
	jwtClaims: Record<string, unknown>,
): OidcTrustPolicy | null {
	return policies.find((policy) => matchPolicy(policy, jwtClaims)) ?? null;
}
