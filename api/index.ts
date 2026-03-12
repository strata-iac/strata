// Vercel Serverless Function entry point.
//
// Vercel discovers functions under /api — this file re-exports the handler
// from apps/server/src/vercel.ts so that rewrites in vercel.json route to
// a deployed serverless function at /api/index.
export { default } from "../apps/server/src/vercel.js";
