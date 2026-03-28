import { eventBus, mintTicket, redeemTicket, type UpdatesService } from "@procella/updates";
import type { Context } from "hono";
import type { Env } from "../types.js";
import { param } from "./params.js";

export function sseHandlers(_updates: UpdatesService) {
	return {
		mintStreamTicket: async (c: Context<Env>) => {
			const updateId = param(c, "updateId");
			const ticket = mintTicket(updateId);
			return c.json({ ticket });
		},

		streamEvents: async (c: Context<Env>) => {
			const ticket = c.req.query("ticket");
			if (!ticket) {
				return c.json({ code: 401, message: "Missing stream ticket" }, 401);
			}

			const updateId = redeemTicket(ticket);
			if (!updateId) {
				return c.json({ code: 401, message: "Invalid or expired stream ticket" }, 401);
			}

			const stream = new ReadableStream({
				start(controller) {
					const encoder = new TextEncoder();

					const send = (data: string) => {
						try {
							controller.enqueue(encoder.encode(`data: ${data}\n\n`));
						} catch {}
					};

					const heartbeat = setInterval(() => {
						try {
							controller.enqueue(encoder.encode(": heartbeat\n\n"));
						} catch {
							clearInterval(heartbeat);
						}
					}, 15_000);

					const unsubscribe = eventBus.subscribe(updateId, (events) => {
						send(JSON.stringify(events));
					});

					c.req.raw.signal.addEventListener("abort", () => {
						clearInterval(heartbeat);
						unsubscribe();
						try {
							controller.close();
						} catch {}
					});
				},
			});

			return new Response(stream, {
				headers: {
					"Cache-Control": "no-cache",
					Connection: "keep-alive",
					"Content-Type": "text/event-stream",
					"X-Accel-Buffering": "no",
				},
			});
		},
	};
}
