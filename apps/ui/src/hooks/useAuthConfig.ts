import { useEffect, useState } from "react";
import { apiBase } from "../config";

export type AuthConfigResponse = { mode: "dev" } | { mode: "descope"; projectId: string };

let cachedConfig: AuthConfigResponse | null = null;
let fetchPromise: Promise<AuthConfigResponse> | null = null;

function readSessionConfig(): AuthConfigResponse | null {
	try {
		const s = sessionStorage.getItem("procella-auth-config");
		return s ? (JSON.parse(s) as AuthConfigResponse) : null;
	} catch {
		return null;
	}
}

function fetchAuthConfig(): Promise<AuthConfigResponse> {
	if (cachedConfig) return Promise.resolve(cachedConfig);
	const ss = readSessionConfig();
	if (ss) {
		cachedConfig = ss;
		return Promise.resolve(ss);
	}
	if (fetchPromise) return fetchPromise;

	fetchPromise = fetch(`${apiBase}/api/auth/config`)
		.then((res) => res.json() as Promise<AuthConfigResponse>)
		.then((data) => {
			cachedConfig = data;
			try {
				sessionStorage.setItem("procella-auth-config", JSON.stringify(data));
			} catch {}
			return data;
		});

	return fetchPromise;
}

export function getAuthConfig(): AuthConfigResponse | null {
	return cachedConfig ?? readSessionConfig();
}

export function useAuthConfig(): {
	config: AuthConfigResponse | null;
	isLoading: boolean;
} {
	const initial = cachedConfig ?? readSessionConfig();
	const [config, setConfig] = useState<AuthConfigResponse | null>(initial);
	const [isLoading, setIsLoading] = useState(initial === null);

	useEffect(() => {
		if (config) return;
		fetchAuthConfig().then((data) => {
			setConfig(data);
			setIsLoading(false);
		});
	}, []);

	return { config, isLoading };
}
