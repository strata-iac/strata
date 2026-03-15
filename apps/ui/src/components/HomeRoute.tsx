import { useSession } from "@descope/react-sdk";
import { Navigate, Outlet, useLocation } from "react-router";
import { useAuthConfig } from "../hooks/useAuthConfig";
import { HomePage } from "../pages/HomePage";

/**
 * Layout route that shows the landing page for unauthenticated users at "/",
 * or renders <Outlet /> (the protected dashboard) for authenticated users.
 * For non-root paths, unauthenticated users are redirected to /login.
 */
export function HomeRoute() {
	const { config, isLoading } = useAuthConfig();
	const location = useLocation();

	if (isLoading || !config) {
		return (
			<div className="min-h-screen bg-zinc-950 flex items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-blue-500" />
			</div>
		);
	}

	if (config.mode === "descope") {
		return <DescopeHomeRoute />;
	}

	// Dev mode: check localStorage token
	const token = localStorage.getItem("procella-token");
	if (!token) {
		if (location.pathname === "/") {
			return <HomePage />;
		}
		return <Navigate to="/login" state={{ returnTo: location.pathname }} replace />;
	}

	return <Outlet />;
}

function DescopeHomeRoute() {
	const { isAuthenticated, isSessionLoading, sessionToken } = useSession();
	const location = useLocation();

	if (isSessionLoading) {
		return (
			<div className="min-h-screen bg-zinc-950 flex items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-blue-500" />
			</div>
		);
	}

	if (!isAuthenticated) {
		if (location.pathname === "/") {
			return <HomePage />;
		}
		return <Navigate to="/login" state={{ returnTo: location.pathname }} replace />;
	}

	if (!sessionToken) {
		return (
			<div className="min-h-screen bg-zinc-950 flex items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-blue-500" />
			</div>
		);
	}

	return <Outlet />;
}
