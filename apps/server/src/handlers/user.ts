// @procella/server — User endpoint handlers.

import type { StacksService } from "@procella/stacks";
import type { Context } from "hono";
import type { Env } from "../types.js";
import { param } from "./params.js";

// ============================================================================
// User Handlers
// ============================================================================

export function userHandlers(stacks: StacksService) {
	return {
		getCurrentUser: (c: Context<Env>) => {
			const caller = c.get("caller");
			return c.json({
				githubLogin: caller.login,
				name: caller.login,
				organizations: [
					{
						githubLogin: caller.orgSlug,
						name: caller.orgSlug,
					},
				],
			});
		},

		getUserStacks: async (c: Context<Env>) => {
			const caller = c.get("caller");
			const stacksList = await stacks.listStacks(caller.tenantId);
			const mapped = stacksList.map((s) => ({
				...s,
				orgName: caller.orgSlug,
			}));
			return c.json({ stacks: mapped });
		},

		/**
		 * GET /api/user/organizations/:orgName — Pulumi CLI fetches org details.
		 * When orgName is "default", returns the caller's default org (used by the
		 * CLI to resolve stack names that omit the org prefix).
		 */
		getOrganization: (c: Context<Env>) => {
			const orgName = param(c, "orgName");
			const caller = c.get("caller");
			if (orgName === "default") {
				return c.json({ githubLogin: caller.orgSlug });
			}
			return c.json({
				githubLogin: orgName,
				name: orgName,
				defaultTeam: { type: "pulumi", name: orgName },
			});
		},
	};
}
