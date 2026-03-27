import { handle } from "hono/aws-lambda";

let handlerFn: ReturnType<typeof handle> | null = null;

async function init() {
	const { bootstrap } = await import("./bootstrap.js");
	const { app } = await bootstrap();
	return handle(app);
}

export const handler: ReturnType<typeof handle> = async (event, lambdaContext) => {
	if (!handlerFn) handlerFn = await init();
	return handlerFn(event, lambdaContext);
};
