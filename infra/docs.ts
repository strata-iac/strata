import { router } from "./router";

const isProd = $app.stage === "production";
const stage = $app.stage;

export const docs = new sst.aws.StaticSite("ProcellaDocs", {
	path: "apps/docs",
	build: {
		command: "bun run build",
		output: "dist",
	},
	router: {
		instance: router,
		domain: isProd ? "docs.procella.cloud" : `docs.${stage}.procella.cloud`,
	},
});
