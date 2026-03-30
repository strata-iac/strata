import { router } from "./router";
import { webApi } from "./web-api";

const isProd = $app.stage === "production";
const stage = $app.stage;

const appDomain = isProd ? "app.procella.cloud" : `app.${stage}.procella.cloud`;
const rootDomain = isProd ? "procella.cloud" : `${stage}.procella.cloud`;

export const site = new sst.aws.StaticSite("ProcellaSite", {
	path: "apps/ui",
	build: {
		command: "bun run build",
		output: "dist",
	},
	router: {
		instance: router,
		domain: appDomain,
	},
	environment: {
		VITE_API_URL: "",
		VITE_APP_URL: `https://${appDomain}`,
	},
});

// Root domain serves the same UI
router.route(`${rootDomain}/*`, site.url);

// tRPC + Descope auth routes go to the Web Lambda (streaming, no cache)
router.route(`${appDomain}/trpc/*`, webApi.url);
router.route(`${appDomain}/api/auth/*`, webApi.url);
