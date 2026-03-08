import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	build: {
		outDir: "dist",
	},
	base: "/",
	server: {
		proxy: {
			"/trpc": "http://127.0.0.1:9090",
			"/api": "http://127.0.0.1:9090",
			"/healthz": "http://127.0.0.1:9090",
		},
	},
});
