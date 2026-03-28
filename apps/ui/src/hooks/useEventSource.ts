import { getSessionToken } from "@descope/react-sdk";
import { useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { useEffect, useRef, useState } from "react";
import { trpc } from "../trpc";
import { getAuthConfig } from "./useAuthConfig";

export type ConnectionStatus = "connected" | "reconnecting" | "disconnected";

function buildAuthHeader(): string {
	const config = getAuthConfig();
	if (config?.mode === "descope") {
		const token = getSessionToken();
		return token ? `Bearer ${token}` : "";
	}
	const token = localStorage.getItem("procella-token") ?? "";
	return token ? `token ${token}` : "";
}

async function fetchStreamTicket(updateId: string): Promise<string> {
	const auth = buildAuthHeader();
	const res = await fetch(`/api/updates/${updateId}/stream-ticket`, {
		method: "POST",
		headers: auth ? { Authorization: auth } : {},
	});
	if (!res.ok) throw new Error(`ticket fetch failed: ${res.status}`);
	const json = (await res.json()) as { ticket: string };
	return json.ticket;
}

export type { ConnectionStatus };

export function useEventSource(updateId: string | undefined) {
	const [status, setStatus] = useState<ConnectionStatus>("disconnected");
	const queryClient = useQueryClient();
	const retryCount = useRef(0);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const esRef = useRef<EventSource | null>(null);

	useEffect(() => {
		if (!updateId) return;

		let cancelled = false;

		const connect = async () => {
			try {
				const ticket = await fetchStreamTicket(updateId);
				if (cancelled) return;

				const url = `/api/updates/${updateId}/stream?ticket=${encodeURIComponent(ticket)}`;
				const es = new EventSource(url);
				esRef.current = es;

				es.onopen = () => {
					setStatus("connected");
					retryCount.current = 0;
				};

				es.onmessage = () => {
					queryClient.invalidateQueries({
						queryKey: getQueryKey(trpc.events.list, undefined, "query"),
					});
					queryClient.invalidateQueries({
						queryKey: getQueryKey(trpc.updates.latest, undefined, "query"),
					});
				};

				es.onerror = () => {
					es.close();
					esRef.current = null;
					if (cancelled) return;
					setStatus("reconnecting");
					const delay = Math.min(1000 * 2 ** retryCount.current, 30000);
					retryCount.current += 1;
					timerRef.current = setTimeout(connect, delay);
				};
			} catch {
				if (cancelled) return;
				setStatus("reconnecting");
				const delay = Math.min(1000 * 2 ** retryCount.current, 30000);
				retryCount.current += 1;
				timerRef.current = setTimeout(connect, delay);
			}
		};

		connect();

		return () => {
			cancelled = true;
			if (timerRef.current) clearTimeout(timerRef.current);
			esRef.current?.close();
			esRef.current = null;
			setStatus("disconnected");
		};
	}, [updateId, queryClient]);

	return status;
}
