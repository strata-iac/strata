const isProd = $app.stage === "production";
const stage = $app.stage;

export const router = new sst.aws.Router("ProcellaRouter", {
	domain: isProd
		? {
				name: "procella.cloud",
				aliases: ["*.procella.cloud"],
				redirects: ["www.procella.cloud"],
			}
		: {
				name: `${stage}.procella.cloud`,
				aliases: [`*.${stage}.procella.cloud`],
			},
});
