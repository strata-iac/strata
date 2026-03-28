import { randomUUID } from "node:crypto";

type EventHandler = (events: unknown[]) => void;

export class EventBus {
	private channels = new Map<string, Set<EventHandler>>();

	subscribe(updateId: string, handler: EventHandler): () => void {
		if (!this.channels.has(updateId)) {
			this.channels.set(updateId, new Set());
		}
		this.channels.get(updateId)?.add(handler);

		return () => {
			this.channels.get(updateId)?.delete(handler);
			if (this.channels.get(updateId)?.size === 0) {
				this.channels.delete(updateId);
			}
		};
	}

	publish(updateId: string, events: unknown[]): void {
		const handlers = this.channels.get(updateId);
		if (!handlers) {
			return;
		}

		for (const handler of handlers) {
			try {
				handler(events);
			} catch {}
		}
	}

	clear(updateId: string): void {
		this.channels.delete(updateId);
	}
}

export const eventBus = new EventBus();

const TICKET_TTL_MS = 60_000;

interface Ticket {
	updateId: string;
	expiresAt: number;
}

const tickets = new Map<string, Ticket>();

export function mintTicket(updateId: string): string {
	const id = randomUUID();
	tickets.set(id, { updateId, expiresAt: Date.now() + TICKET_TTL_MS });
	return id;
}

export function redeemTicket(ticket: string): string | null {
	const entry = tickets.get(ticket);
	if (!entry) return null;
	tickets.delete(ticket);
	if (Date.now() > entry.expiresAt) return null;
	return entry.updateId;
}
