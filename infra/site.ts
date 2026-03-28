import { router } from "./api";

const isProd = $app.stage === "production";
const stage = $app.stage;

export const site = new sst.aws.StaticSite("ProcellaSite", {
	path: "apps/ui",
	build: {
		command: "bun run build",
		output: "dist",
	},
	domain: isProd
		? {
				name: "app.procella.cloud",
				redirects: ["www.procella.cloud", "procella.cloud"],
			}
		: `app.${stage}.procella.cloud`,
	environment: {
		VITE_API_URL: router.url,
		VITE_APP_URL: isProd ? "https://app.procella.cloud" : `https://app.${stage}.procella.cloud`,
	},
	transform: {
		cdn: (args) => {
			args.customErrorResponses = [
				{ errorCode: 403, responsePagePath: "/index.html", responseCode: 200 },
				{ errorCode: 404, responsePagePath: "/index.html", responseCode: 200 },
			];
		},
	},
});
