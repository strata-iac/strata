import type { AuditService } from "@procella/audit";
import { BadRequestError } from "@procella/types";
import type { Context } from "hono";
import { z } from "zod/v4";
import type { Env } from "../types.js";
import { param } from "./params.js";

const auditQuerySchema = z.object({
	startTime: z.coerce.date().optional(),
	endTime: z.coerce.date().optional(),
	action: z.string().optional(),
	page: z.coerce.number().int().min(1).optional(),
	pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

export function auditHandlers(deps: { audit: AuditService }) {
	return {
		queryAuditLogs: async (c: Context<Env>) => {
			const caller = c.get("caller");
			const org = param(c, "org");
			if (org !== caller.orgSlug) {
				throw new BadRequestError("Organization does not match caller organization");
			}

			const params = auditQuerySchema.parse({
				startTime: c.req.query("startTime"),
				endTime: c.req.query("endTime"),
				action: c.req.query("action"),
				page: c.req.query("page"),
				pageSize: c.req.query("pageSize"),
			});

			const result = await deps.audit.query(caller.tenantId, params);
			return c.json(result);
		},

		exportAuditLogs: async (c: Context<Env>) => {
			const caller = c.get("caller");
			const org = param(c, "org");
			if (org !== caller.orgSlug) {
				throw new BadRequestError("Organization does not match caller organization");
			}

			const params = auditQuerySchema.parse({
				startTime: c.req.query("startTime"),
				endTime: c.req.query("endTime"),
				action: c.req.query("action"),
			});

			const entries = await deps.audit.export(caller.tenantId, params);
			return c.json(entries);
		},
	};
}
