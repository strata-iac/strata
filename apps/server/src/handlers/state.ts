// @procella/server — Export/import state handlers.

import type { StacksService } from "@procella/stacks";
import type { UntypedDeployment } from "@procella/types";
import type { UpdatesService } from "@procella/updates";
import type { Context } from "hono";
import type { Env } from "../types.js";
import { param } from "./params.js";
import { UntypedDeploymentSchema } from "./schemas.js";

// ============================================================================
// State Handlers
// ============================================================================

export function stateHandlers(updates: UpdatesService, stacks: StacksService) {
	return {
		exportStack: async (c: Context<Env>) => {
			const caller = c.get("caller");
			const org = param(c, "org");
			const project = param(c, "project");
			const stack = param(c, "stack");
			const stackInfo = await stacks.getStack(caller.tenantId, org, project, stack);
			const versionParam = c.req.param("version");
			const version = versionParam ? Number.parseInt(versionParam, 10) : undefined;
			const result = await updates.exportStack(stackInfo.id, version);
			return c.json(result);
		},

		importStack: async (c: Context<Env>) => {
			const caller = c.get("caller");
			const org = param(c, "org");
			const project = param(c, "project");
			const stack = param(c, "stack");
			const stackInfo = await stacks.getStack(caller.tenantId, org, project, stack);
			const raw = await c.req.json<UntypedDeployment>();
			const parseResult = UntypedDeploymentSchema.safeParse(raw);
			if (!parseResult.success) {
				return c.json({ code: "invalid_request", message: parseResult.error.message }, 400);
			}
			const body = parseResult.data;
			const result = await updates.importStack(stackInfo.id, body);
			return c.json(result);
		},
	};
}
