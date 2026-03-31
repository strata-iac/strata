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
	transform: {
		cdn: {
			transform: {
				distribution: {
					// HTTP/3 (QUIC) enables 0-RTT connection resumption — eliminates
					// TLS handshake latency on repeat connections. Critical for the
					// Pulumi CLI which makes ~18 sequential requests per operation.
					httpVersion: "http2and3",
				},
			},
		},
	},
});
