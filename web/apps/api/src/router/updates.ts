import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { organizations, projects, stacks, updates } from "../db/schema.js";
import { publicProcedure, router } from "./trpc.js";

export const updatesRouter = router({
	list: publicProcedure
		.input(
			z.object({
				org: z.string(),
				project: z.string(),
				stack: z.string(),
				page: z.number().int().positive().default(1),
				pageSize: z.number().int().positive().max(100).default(20),
			}),
		)
		.query(async ({ ctx, input }) => {
			const offset = (input.page - 1) * input.pageSize;

			const rows = await ctx.db
				.select({
					updateId: updates.id,
					kind: updates.kind,
					status: updates.status,
					version: updates.version,
					config: updates.config,
					metadata: updates.metadata,
					createdAt: updates.createdAt,
					startedAt: updates.startedAt,
					completedAt: updates.completedAt,
				})
				.from(updates)
				.innerJoin(stacks, eq(updates.stackId, stacks.id))
				.innerJoin(projects, eq(stacks.projectId, projects.id))
				.innerJoin(organizations, eq(projects.organizationId, organizations.id))
				.where(
					and(
						eq(organizations.githubLogin, input.org),
						eq(projects.name, input.project),
						eq(stacks.name, input.stack),
					),
				)
				.orderBy(desc(updates.createdAt))
				.limit(input.pageSize)
				.offset(offset);

			return rows.map((r) => toUpdateInfo(r));
		}),

	latest: publicProcedure
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
					updateId: updates.id,
					kind: updates.kind,
					status: updates.status,
					version: updates.version,
					config: updates.config,
					metadata: updates.metadata,
					createdAt: updates.createdAt,
					startedAt: updates.startedAt,
					completedAt: updates.completedAt,
				})
				.from(updates)
				.innerJoin(stacks, eq(updates.stackId, stacks.id))
				.innerJoin(projects, eq(stacks.projectId, projects.id))
				.innerJoin(organizations, eq(projects.organizationId, organizations.id))
				.where(
					and(
						eq(organizations.githubLogin, input.org),
						eq(projects.name, input.project),
						eq(stacks.name, input.stack),
					),
				)
				.orderBy(desc(updates.createdAt))
				.limit(1);

			return row ? toUpdateInfo(row) : null;
		}),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

interface UpdateRow {
	readonly updateId: string;
	readonly kind: string;
	readonly status: string;
	readonly version: number;
	readonly config: unknown;
	readonly metadata: unknown;
	readonly createdAt: Date;
	readonly startedAt: Date | null;
	readonly completedAt: Date | null;
}

function toUpdateInfo(r: UpdateRow) {
	const startTime = r.startedAt ? Math.floor(r.startedAt.getTime() / 1000) : 0;
	const endTime = r.completedAt ? Math.floor(r.completedAt.getTime() / 1000) : 0;

	// Map DB status to what the UI expects
	const resultMap: Record<string, string> = {
		succeeded: "succeeded",
		failed: "failed",
		cancelled: "cancelled",
		running: "in-progress",
		"not started": "not-started",
		requested: "not-started",
	};

	return {
		updateID: r.updateId,
		kind: r.kind,
		result: resultMap[r.status] ?? r.status,
		version: r.version,
		message: ((r.metadata as Record<string, unknown>)?.message as string) ?? "",
		environment: ((r.metadata as Record<string, unknown>)?.environment ?? {}) as Record<
			string,
			string
		>,
		config: (r.config ?? {}) as Record<string, { value: string; secret: boolean }>,
		startTime,
		endTime,
		resourceChanges: ((r.metadata as Record<string, unknown>)?.resourceChanges ?? undefined) as
			| Record<string, number>
			| undefined,
	};
}
