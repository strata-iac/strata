import { Descope } from "@descope/react-sdk";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useAuthConfig } from "../hooks/useAuthConfig";

export function Login() {
	const { config, isLoading } = useAuthConfig();
	const location = useLocation();
	const returnTo = (location.state as { returnTo?: string })?.returnTo ?? "/";

	if (isLoading || !config) {
		return (
			<div className="min-h-screen bg-zinc-950 flex items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-blue-500" />
			</div>
		);
	}

	if (config.mode === "descope") {
		return <DescopeLogin returnTo={returnTo} />;
	}

	return <DevLogin returnTo={returnTo} />;
}

function DescopeLogin({ returnTo }: { returnTo: string }) {
	const navigate = useNavigate();

	return (
		<div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4">
			<Link to="/" className="flex items-center gap-2.5 mb-8">
				<svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-blue-500">
					<path
						d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
				<span className="text-2xl font-bold tracking-tight text-zinc-100">Procella</span>
			</Link>
			<p className="text-sm text-zinc-400 mb-8">Sign in to your Pulumi backend</p>
			<div className="w-full max-w-md">
				<Descope
					flowId="sign-up-or-in"
					theme="dark"
					onSuccess={() => navigate(returnTo, { replace: true })}
					onError={() => {}}
				/>
			</div>
		</div>
	);
}

function DevLogin({ returnTo }: { returnTo: string }) {
	const navigate = useNavigate();
	const [token, setToken] = useState("");

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (!token.trim()) return;
		localStorage.setItem("procella-token", token.trim());
		navigate(returnTo, { replace: true });
	};

	return (
		<div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4">
			<Link to="/" className="flex items-center gap-2.5 mb-3">
				<svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-blue-500">
					<path
						d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
				<span className="text-2xl font-bold tracking-tight text-zinc-100">Procella</span>
			</Link>
			<p className="text-sm text-zinc-400 mb-8">Enter your API token to continue</p>
			<form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
				<input
					type="password"
					value={token}
					onChange={(e) => setToken(e.target.value)}
					placeholder="API token"
					className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
				/>
				<button
					type="submit"
					disabled={!token.trim()}
					className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-medium py-3 px-4 rounded-lg transition-colors"
				>
					Connect
				</button>
			</form>
			<div className="mt-6 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800/50 border border-zinc-700/50">
				<span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
				<span className="text-xs text-zinc-500">Dev mode</span>
			</div>
		</div>
	);
}
