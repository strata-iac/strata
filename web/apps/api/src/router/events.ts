import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { organizations, projects, stacks, updateEvents, updates } from "../db/schema.js";
import { publicProcedure, router } from "./trpc.js";

export const eventsRouter = router({
	list: publicProcedure
		.input(
			z.object({
				org: z.string(),
				project: z.string(),
				stack: z.string(),
				updateID: z.string().uuid(),
				continuationToken: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			// Parse continuation token (it's the last seen sequence number)
			const afterSequence = input.continuationToken
				? Number.parseInt(input.continuationToken, 10)
				: -1;

			// Verify the update belongs to the caller's org (authorization)
			const [update] = await ctx.db
				.select({ id: updates.id, status: updates.status })
				.from(updates)
				.innerJoin(stacks, eq(updates.stackId, stacks.id))
				.innerJoin(projects, eq(stacks.projectId, projects.id))
				.innerJoin(organizations, eq(projects.organizationId, organizations.id))
				.where(
					and(
						eq(updates.id, input.updateID),
						eq(organizations.githubLogin, input.org),
						eq(projects.name, input.project),
						eq(stacks.name, input.stack),
					),
				)
				.limit(1);

			if (!update) {
				return { events: [], continuationToken: null };
			}

			const rows = await ctx.db
				.select({
					sequence: updateEvents.sequence,
					timestamp: updateEvents.timestamp,
					eventData: updateEvents.eventData,
				})
				.from(updateEvents)
				.where(
					and(eq(updateEvents.updateId, input.updateID), gt(updateEvents.sequence, afterSequence)),
				)
				.orderBy(updateEvents.sequence)
				.limit(100);

			const events = rows.map((r) => ({
				sequence: r.sequence,
				timestamp: r.timestamp,
				...(r.eventData as Record<string, unknown>),
			}));

			// Continuation: if the update is still running and we got events, send back a token
			const isRunning = update.status === "running" || update.status === "not started";
			const lastSeq = rows.length > 0 ? rows[rows.length - 1]?.sequence : undefined;
			const continuationToken =
				isRunning || rows.length === 100
					? lastSeq !== undefined
						? String(lastSeq)
						: (input.continuationToken ?? null)
					: null;

			return { events, continuationToken };
		}),
});
