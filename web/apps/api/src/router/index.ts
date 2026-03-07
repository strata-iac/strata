import { eventsRouter } from "./events.js";
import { stacksRouter } from "./stacks.js";
import { router } from "./trpc.js";
import { updatesRouter } from "./updates.js";

export const appRouter = router({
	stacks: stacksRouter,
	updates: updatesRouter,
	events: eventsRouter,
});

export type AppRouter = typeof appRouter;
