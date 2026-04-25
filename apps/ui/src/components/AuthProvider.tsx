import { AuthProvider, useSession } from "@descope/react-sdk";
import { type ReactNode, useEffect } from "react";
import { setStoredDescopeSessionToken } from "../auth/sessionToken";
import { useAuthConfig } from "../hooks/useAuthConfig";

function DescopeSessionTokenBridge() {
	const { sessionToken } = useSession();

	useEffect(() => {
		setStoredDescopeSessionToken(sessionToken);
	}, [sessionToken]);

	return null;
}

export function ProcellaAuthProvider({ children }: { children: ReactNode }) {
	const { config, isLoading } = useAuthConfig();

	if (isLoading || !config) {
		return (
			<div className="min-h-screen bg-deep-sky flex items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-cloud/30 border-t-lightning" />
			</div>
		);
	}

	if (config.mode === "descope") {
		localStorage.removeItem("procella-token");
		return (
			<AuthProvider projectId={config.projectId}>
				<DescopeSessionTokenBridge />
				{children}
			</AuthProvider>
		);
	}

	setStoredDescopeSessionToken(null);
	return <>{children}</>;
}
