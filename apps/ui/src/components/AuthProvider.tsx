import { AuthProvider } from "@descope/react-sdk";
import type { ReactNode } from "react";
import { useAuthConfig } from "../hooks/useAuthConfig";

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
		return <AuthProvider projectId={config.projectId}>{children}</AuthProvider>;
	}

	return <>{children}</>;
}
