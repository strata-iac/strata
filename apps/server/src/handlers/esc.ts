import type {
	CreateEnvironmentInput,
	DraftStatus,
	EscService,
	UpdateEnvironmentInput,
} from "@procella/esc";
import { BadRequestError, NotFoundError } from "@procella/types";
import type { Context } from "hono";
import { z } from "zod/v4";
import type { Env } from "../types.js";
import { param } from "./params.js";

const yamlBodySchema = z.object({ yamlBody: z.string() });

const envTagsSchema = z.record(z.string(), z.string());
const envTagsPatchSchema = z.record(z.string(), z.string().nullable());
const draftCreateSchema = z.object({
	yamlBody: z.string(),
	description: z.string().optional().default(""),
});
const draftStatusSchema = z.enum(["open", "applied", "discarded"]);

export function escHandlers(deps: { esc: EscService }) {
	const requireOrgMatch = (c: Context<Env>): string => {
		const caller = c.get("caller");
		const org = param(c, "org");
		if (org !== caller.orgSlug) {
			throw new BadRequestError("Organization does not match caller organization");
		}
		return caller.tenantId;
	};

	return {
		createEnvironment: async (c: Context<Env>) => {
			const tenantId = requireOrgMatch(c);
			const caller = c.get("caller");
			const projectName = param(c, "project");
			const body = await c.req.json().catch(() => ({}));
			const schema = z.object({ name: z.string().min(1), yamlBody: z.string() });
			const parsed = schema.parse(body);
			const input: CreateEnvironmentInput = {
				projectName,
				name: parsed.name,
				yamlBody: parsed.yamlBody,
			};
			const env = await deps.esc.createEnvironment(tenantId, input, caller.userId);
			return c.json(env, 201);
		},

		listEnvironments: async (c: Context<Env>) => {
			const tenantId = requireOrgMatch(c);
			const projectName = param(c, "project");
			const envs = await deps.esc.listEnvironments(tenantId, projectName);
			return c.json({ environments: envs });
		},

		getEnvironment: async (c: Context<Env>) => {
			const tenantId = requireOrgMatch(c);
			const projectName = param(c, "project");
			const envName = param(c, "envName");
			const env = await deps.esc.getEnvironment(tenantId, projectName, envName);
			if (!env) {
				throw new NotFoundError("Environment", `${projectName}/${envName}`);
			}
			return c.json(env);
		},

		updateEnvironment: async (c: Context<Env>) => {
			const tenantId = requireOrgMatch(c);
			const caller = c.get("caller");
			const projectName = param(c, "project");
			const envName = param(c, "envName");
			const body = await c.req.json().catch(() => ({}));
			const parsed = yamlBodySchema.parse(body);
			const input: UpdateEnvironmentInput = { yamlBody: parsed.yamlBody };
			const env = await deps.esc.updateEnvironment(
				tenantId,
				projectName,
				envName,
				input,
				caller.userId,
			);
			return c.json(env);
		},

		deleteEnvironment: async (c: Context<Env>) => {
			const tenantId = requireOrgMatch(c);
			const projectName = param(c, "project");
			const envName = param(c, "envName");
			await deps.esc.deleteEnvironment(tenantId, projectName, envName);
			return c.body(null, 204);
		},

		listRevisions: async (c: Context<Env>) => {
			const tenantId = requireOrgMatch(c);
			const projectName = param(c, "project");
			const envName = param(c, "envName");
			const revisions = await deps.esc.listRevisions(tenantId, projectName, envName);
			return c.json({ revisions });
		},

		getRevision: async (c: Context<Env>) => {
			const tenantId = requireOrgMatch(c);
			const projectName = param(c, "project");
			const envName = param(c, "envName");
			const versionStr = param(c, "version");
			const revisionNumber = Number.parseInt(versionStr, 10);
			if (!Number.isInteger(revisionNumber) || revisionNumber < 1) {
				throw new BadRequestError("version must be a positive integer");
			}
			const rev = await deps.esc.getRevision(tenantId, projectName, envName, revisionNumber);
			if (!rev) {
				throw new NotFoundError("EnvironmentRevision", `${projectName}/${envName}#${versionStr}`);
			}
			return c.json(rev);
		},

		openSession: async (c: Context<Env>) => {
			const tenantId = requireOrgMatch(c);
			const projectName = param(c, "project");
			const envName = param(c, "envName");
			const result = await deps.esc.openSession(tenantId, projectName, envName);
			return c.json(result, 201);
		},

		getSession: async (c: Context<Env>) => {
			const tenantId = requireOrgMatch(c);
			const projectName = param(c, "project");
			const envName = param(c, "envName");
			const sessionId = param(c, "sessionId");
			const result = await deps.esc.getSession(tenantId, projectName, envName, sessionId);
			if (!result) {
				throw new NotFoundError("EscSession", sessionId);
			}
			return c.json(result);
		},

		listRevisionTags: async (c: Context<Env>) => {
			const tenantId = requireOrgMatch(c);
			const projectName = param(c, "project");
			const envName = param(c, "envName");
			const tags = await deps.esc.listRevisionTags(tenantId, projectName, envName);
			return c.json({ tags });
		},

		tagRevision: async (c: Context<Env>) => {
			const tenantId = requireOrgMatch(c);
			const caller = c.get("caller");
			const projectName = param(c, "project");
			const envName = param(c, "envName");
			const versionStr = param(c, "version");
			const tagName = param(c, "tagName");
			const revisionNumber = Number.parseInt(versionStr, 10);
			if (!Number.isInteger(revisionNumber) || revisionNumber < 1) {
				throw new BadRequestError("version must be a positive integer");
			}
			await deps.esc.tagRevision(
				tenantId,
				projectName,
				envName,
				revisionNumber,
				tagName,
				caller.userId,
			);
			return c.body(null, 204);
		},

		untagRevision: async (c: Context<Env>) => {
			const tenantId = requireOrgMatch(c);
			const projectName = param(c, "project");
			const envName = param(c, "envName");
			const tagName = param(c, "tagName");
			await deps.esc.untagRevision(tenantId, projectName, envName, tagName);
			return c.body(null, 204);
		},

		getEnvironmentTags: async (c: Context<Env>) => {
			const tenantId = requireOrgMatch(c);
			const projectName = param(c, "project");
			const envName = param(c, "envName");
			const tags = await deps.esc.getEnvironmentTags(tenantId, projectName, envName);
			return c.json({ tags });
		},

		setEnvironmentTags: async (c: Context<Env>) => {
			const tenantId = requireOrgMatch(c);
			const projectName = param(c, "project");
			const envName = param(c, "envName");
			const body = await c.req.json().catch(() => ({}));
			const tags = envTagsSchema.parse(body);
			await deps.esc.setEnvironmentTags(tenantId, projectName, envName, tags);
			return c.body(null, 204);
		},

		updateEnvironmentTags: async (c: Context<Env>) => {
			const tenantId = requireOrgMatch(c);
			const projectName = param(c, "project");
			const envName = param(c, "envName");
			const body = await c.req.json().catch(() => ({}));
			const patch = envTagsPatchSchema.parse(body);
			await deps.esc.updateEnvironmentTags(tenantId, projectName, envName, patch);
			return c.body(null, 204);
		},

		createDraft: async (c: Context<Env>) => {
			const tenantId = requireOrgMatch(c);
			const caller = c.get("caller");
			const projectName = param(c, "project");
			const envName = param(c, "envName");
			const body = await c.req.json().catch(() => ({}));
			const parsed = draftCreateSchema.parse(body);
			const draft = await deps.esc.createDraft(
				tenantId,
				projectName,
				envName,
				parsed.yamlBody,
				parsed.description,
				caller.userId,
			);
			return c.json(draft, 201);
		},

		listDrafts: async (c: Context<Env>) => {
			const tenantId = requireOrgMatch(c);
			const projectName = param(c, "project");
			const envName = param(c, "envName");
			const rawStatus = c.req.query("status");
			let status: DraftStatus | undefined;
			if (rawStatus !== undefined) {
				const parsed = draftStatusSchema.safeParse(rawStatus);
				if (!parsed.success) {
					throw new BadRequestError("status must be one of: open, applied, discarded");
				}
				status = parsed.data;
			}
			const drafts = await deps.esc.listDrafts(tenantId, projectName, envName, status);
			return c.json({ drafts });
		},

		getDraft: async (c: Context<Env>) => {
			const tenantId = requireOrgMatch(c);
			const projectName = param(c, "project");
			const envName = param(c, "envName");
			const draftId = param(c, "draftId");
			const draft = await deps.esc.getDraft(tenantId, projectName, envName, draftId);
			if (!draft) {
				throw new NotFoundError("Draft", draftId);
			}
			return c.json(draft);
		},

		applyDraft: async (c: Context<Env>) => {
			const tenantId = requireOrgMatch(c);
			const caller = c.get("caller");
			const projectName = param(c, "project");
			const envName = param(c, "envName");
			const draftId = param(c, "draftId");
			const draft = await deps.esc.applyDraft(
				tenantId,
				projectName,
				envName,
				draftId,
				caller.userId,
			);
			return c.json(draft);
		},

		discardDraft: async (c: Context<Env>) => {
			const tenantId = requireOrgMatch(c);
			const projectName = param(c, "project");
			const envName = param(c, "envName");
			const draftId = param(c, "draftId");
			await deps.esc.discardDraft(tenantId, projectName, envName, draftId);
			return c.body(null, 204);
		},
	};
}
