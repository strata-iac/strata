import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";
import { publicProcedure, router } from "../trpc.js";

const orgInput = z.object({ org: z.string() });

const createWebhookInput = z.object({
	org: z.string(),
	name: z.string().min(1),
	url: z.string().url(),
	events: z.array(z.string()).min(1),
	secret: z.string().min(1).optional(),
});

const updateWebhookInput = z.object({
	org: z.string(),
	webhookId: z.string().uuid(),
	name: z.string().min(1).optional(),
	url: z.string().url().optional(),
	events: z.array(z.string()).min(1).optional(),
	secret: z.string().min(1).optional(),
});

const webhookIdInput = z.object({
	org: z.string(),
	webhookId: z.string().uuid(),
});

export const webhooksRouter = router({
	list: publicProcedure.input(orgInput).query(async ({ ctx, input }) => {
		if (input.org !== ctx.caller.orgSlug) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Organization does not match caller organization",
			});
		}
		return ctx.webhooks.listWebhooks(ctx.caller.tenantId);
	}),

	create: publicProcedure.input(createWebhookInput).mutation(async ({ ctx, input }) => {
		if (input.org !== ctx.caller.orgSlug) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Organization does not match caller organization",
			});
		}

		return ctx.webhooks.createWebhook(
			ctx.caller.tenantId,
			{
				name: input.name,
				url: input.url,
				events: input.events,
				secret: input.secret,
			},
			ctx.caller.userId,
		);
	}),

	get: publicProcedure.input(webhookIdInput).query(async ({ ctx, input }) => {
		if (input.org !== ctx.caller.orgSlug) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Organization does not match caller organization",
			});
		}

		const webhook = await ctx.webhooks.getWebhook(ctx.caller.tenantId, input.webhookId);
		if (!webhook) {
			throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });
		}
		return webhook;
	}),

	update: publicProcedure.input(updateWebhookInput).mutation(async ({ ctx, input }) => {
		if (input.org !== ctx.caller.orgSlug) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Organization does not match caller organization",
			});
		}

		return ctx.webhooks.updateWebhook(ctx.caller.tenantId, input.webhookId, {
			name: input.name,
			url: input.url,
			events: input.events,
			secret: input.secret,
		});
	}),

	delete: publicProcedure.input(webhookIdInput).mutation(async ({ ctx, input }) => {
		if (input.org !== ctx.caller.orgSlug) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Organization does not match caller organization",
			});
		}

		await ctx.webhooks.deleteWebhook(ctx.caller.tenantId, input.webhookId);
		return { success: true };
	}),

	deliveries: publicProcedure
		.input(webhookIdInput.extend({ limit: z.number().int().min(1).max(200).optional() }))
		.query(async ({ ctx, input }) => {
			if (input.org !== ctx.caller.orgSlug) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Organization does not match caller organization",
				});
			}

			return ctx.webhooks.listDeliveries(ctx.caller.tenantId, input.webhookId, input.limit);
		}),

	ping: publicProcedure.input(webhookIdInput).mutation(async ({ ctx, input }) => {
		if (input.org !== ctx.caller.orgSlug) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Organization does not match caller organization",
			});
		}

		return ctx.webhooks.ping(ctx.caller.tenantId, input.webhookId);
	}),
});
