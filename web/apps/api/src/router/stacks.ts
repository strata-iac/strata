import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { organizations, projects, stacks } from "../db/schema.js";
import { publicProcedure, router } from "./trpc.js";

export const stacksRouter = router({
	list: publicProcedure.query(async ({ ctx }) => {
		const rows = await ctx.db
			.select({
				orgName: organizations.githubLogin,
				projectName: projects.name,
				stackName: stacks.name,
				tags: stacks.tags,
				version: stacks.lastCheckpointVersion,
				activeUpdate: stacks.currentOperationId,
			})
			.from(stacks)
			.innerJoin(projects, eq(stacks.projectId, projects.id))
			.innerJoin(organizations, eq(projects.organizationId, organizations.id))
			.where(eq(organizations.githubLogin, ctx.caller.org));

		return rows.map((r) => ({
			orgName: r.orgName,
			projectName: r.projectName,
			stackName: r.stackName,
			tags: (r.tags ?? {}) as Record<string, string>,
			version: r.version,
			activeUpdate: r.activeUpdate ?? "",
			currentOperation: r.activeUpdate ? "in-progress" : "",
		}));
	}),

	get: publicProcedure
		.input(
			z.object({
				org: z.string(),
				project: z.string(),
				stack: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const [row] = await ctx.db
				.select({
					orgName: organizations.githubLogin,
					projectName: projects.name,
					stackName: stacks.name,
					tags: stacks.tags,
					version: stacks.lastCheckpointVersion,
					activeUpdate: stacks.currentOperationId,
				})
				.from(stacks)
				.innerJoin(projects, eq(stacks.projectId, projects.id))
				.innerJoin(organizations, eq(projects.organizationId, organizations.id))
				.where(
					and(
						eq(organizations.githubLogin, input.org),
						eq(projects.name, input.project),
						eq(stacks.name, input.stack),
					),
				)
				.limit(1);

			if (!row) {
				return null;
			}

			return {
				orgName: row.orgName,
				projectName: row.projectName,
				stackName: row.stackName,
				tags: (row.tags ?? {}) as Record<string, string>,
				version: row.version,
				activeUpdate: row.activeUpdate ?? "",
				currentOperation: row.activeUpdate ? "in-progress" : "",
			};
		}),
});
