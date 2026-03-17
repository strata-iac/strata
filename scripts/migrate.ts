#!/usr/bin/env bun
// Migration script that uses Bun's native postgres driver (supports Neon SNI).
// Equivalent to `drizzle-kit migrate` but works with Neon serverless endpoints.

import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { SQL } from "bun";

const url = process.env.PROCELLA_DATABASE_URL;
if (!url) {
	console.error("PROCELLA_DATABASE_URL is required");
	process.exit(1);
}

const client = new SQL(url);
const db = drizzle({ client });

console.log("Running migrations...");
await migrate(db, { migrationsFolder: "packages/db/drizzle" });
console.log("Migrations complete.");

client.close();