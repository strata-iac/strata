import { AesCryptoService } from "@procella/crypto";
import {
	type Database,
	escEnvironmentRevisions,
	escEnvironments,
	escProjects,
	escSessions,
} from "@procella/db";
import { BadRequestError, ConflictError, NotFoundError, ProcellaError } from "@procella/types";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import type { EvaluateDiagnostic, EvaluatorClient } from "./evaluator-client.js";
import type {
	CreateEnvironmentInput,
	EscEnvironment,
	EscEnvironmentRevision,
	EscProject,
	OpenSessionResult,
	UpdateEnvironmentInput,
} from "./types.js";

export interface EscService {
	listProjects(tenantId: string): Promise<EscProject[]>;

	createEnvironment(
		tenantId: string,
		input: CreateEnvironmentInput,
		createdBy: string,
	): Promise<EscEnvironment>;
	listEnvironments(tenantId: string, projectName: string): Promise<EscEnvironment[]>;
	getEnvironment(
		tenantId: string,
		projectName: string,
		envName: string,
	): Promise<EscEnvironment | null>;
	updateEnvironment(
		tenantId: string,
		projectName: string,
		envName: string,
		input: UpdateEnvironmentInput,
		updatedBy: string,
	): Promise<EscEnvironment>;
	deleteEnvironment(tenantId: string, projectName: string, envName: string): Promise<void>;

	listRevisions(
		tenantId: string,
		projectName: string,
		envName: string,
	): Promise<EscEnvironmentRevision[]>;
	getRevision(
		tenantId: string,
		projectName: string,
		envName: string,
		revisionNumber: number,
	): Promise<EscEnvironmentRevision | null>;

	openSession(tenantId: string, projectName: string, envName: string): Promise<OpenSessionResult>;
	getSession(
		tenantId: string,
		projectName: string,
		envName: string,
		sessionId: string,
	): Promise<OpenSessionResult | null>;
}

export interface PostgresEscServiceDeps {
	db: Database;
	evaluator: EvaluatorClient;
	encryptionKeyHex: string;
	sessionTtlSeconds?: number;
}

// ============================================================================
// EscEvaluationError — 422 with evaluator diagnostics
// ============================================================================

export class EscEvaluationError extends ProcellaError {
	public readonly diagnostics: EvaluateDiagnostic[];

	constructor(diagnostics: EvaluateDiagnostic[]) {
		const summaries = diagnostics.map((d) => d.summary).join("; ");
		super(`Evaluation failed: ${summaries}`, "ESC_EVALUATION_ERROR", 422);
		this.name = "EscEvaluationError";
		this.diagnostics = diagnostics;
	}
}

// ============================================================================
// YAML import-list extraction (no npm yaml dep — evaluator does real parsing)
// ============================================================================

const MAX_IMPORT_DEPTH = 50;

/**
 * Extract `imports:` list from YAML body. Handles:
 * - `imports: [a, b, c]` (flow sequence)
 * - `imports:\n  - a\n  - b` (block sequence)
 * - Missing/empty imports → []
 * - Quoted/unquoted strings
 */
function extractImports(yamlBody: string): string[] {
	// Try flow sequence: imports: [a, b, c] or imports: ["a", 'b']
	const flowMatch = yamlBody.match(/^imports:\s*\[([^\]]*)\]/m);
	if (flowMatch) {
		const inner = flowMatch[1].trim();
		if (!inner) return [];
		return inner
			.split(",")
			.map((s) => s.trim().replace(/^["']|["']$/g, ""))
			.filter(Boolean);
	}

	// Try block sequence: imports:\n  - a\n  - b
	const blockMatch = yamlBody.match(/^imports:\s*\n((?:[ \t]+-[^\n]*\n?)+)/m);
	if (blockMatch) {
		return blockMatch[1]
			.split("\n")
			.map((line) =>
				line
					.replace(/^[ \t]+-\s*/, "")
					.trim()
					.replace(/^["']|["']$/g, ""),
			)
			.filter(Boolean);
	}

	return [];
}

function pgErrorCode(err: unknown): string | undefined {
	let current: unknown = err;
	for (let i = 0; i < 10 && current != null; i++) {
		if (typeof current === "object") {
			const rec = current as Record<string, unknown>;
			for (const key of ["code", "errno"] as const) {
				const val = rec[key];
				const str = typeof val === "number" ? String(val) : val;
				if (typeof str === "string" && /^[0-9A-Z]{5}$/i.test(str)) return str;
			}
			if (Array.isArray(rec.errors)) {
				for (const inner of rec.errors) {
					const found = pgErrorCode(inner);
					if (found) return found;
				}
			}
			if ("cause" in rec) {
				current = rec.cause;
				continue;
			}
		}
		current = undefined;
	}
	return undefined;
}

function validateName(kind: "project" | "environment", value: string): void {
	if (!value || value.length > 128) {
		throw new BadRequestError(`${kind} name must be 1-128 characters`);
	}
	if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
		throw new BadRequestError(`${kind} name may only contain letters, digits, '.', '_', '-'`);
	}
}

type EscEnvRow = typeof escEnvironments.$inferSelect;
type EscProjectRow = typeof escProjects.$inferSelect;
type EscRevisionRow = typeof escEnvironmentRevisions.$inferSelect;
type TxOrDb = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

function toEnvInfo(row: EscEnvRow): EscEnvironment {
	return {
		id: row.id,
		projectId: row.projectId,
		name: row.name,
		yamlBody: row.yamlBody,
		currentRevisionNumber: row.currentRevisionNumber,
		createdBy: row.createdBy,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

function toProjectInfo(row: EscProjectRow): EscProject {
	return {
		id: row.id,
		tenantId: row.tenantId,
		name: row.name,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

function toRevisionInfo(row: EscRevisionRow): EscEnvironmentRevision {
	return {
		id: row.id,
		environmentId: row.environmentId,
		revisionNumber: row.revisionNumber,
		yamlBody: row.yamlBody,
		createdBy: row.createdBy,
		createdAt: row.createdAt,
	};
}

async function findEnvRow(
	db: TxOrDb,
	tenantId: string,
	projectName: string,
	envName: string,
): Promise<EscEnvRow | null> {
	const [row] = await db
		.select({ env: escEnvironments })
		.from(escEnvironments)
		.innerJoin(escProjects, eq(escEnvironments.projectId, escProjects.id))
		.where(
			and(
				eq(escProjects.tenantId, tenantId),
				eq(escProjects.name, projectName),
				eq(escEnvironments.name, envName),
				isNull(escEnvironments.deletedAt),
			),
		)
		.limit(1);
	return row?.env ?? null;
}

export class PostgresEscService implements EscService {
	private readonly db: Database;
	private readonly evaluator: EvaluatorClient;
	private readonly encryptionKeyHex: string;
	private readonly sessionTtlSeconds: number;

	constructor(deps: PostgresEscServiceDeps) {
		this.db = deps.db;
		this.evaluator = deps.evaluator;
		this.encryptionKeyHex = deps.encryptionKeyHex;
		this.sessionTtlSeconds = deps.sessionTtlSeconds ?? 3600;
	}

	async listProjects(tenantId: string): Promise<EscProject[]> {
		const rows = await this.db
			.select()
			.from(escProjects)
			.where(eq(escProjects.tenantId, tenantId))
			.orderBy(escProjects.name);
		return rows.map(toProjectInfo);
	}

	async createEnvironment(
		tenantId: string,
		input: CreateEnvironmentInput,
		createdBy: string,
	): Promise<EscEnvironment> {
		validateName("project", input.projectName);
		validateName("environment", input.name);
		if (typeof input.yamlBody !== "string") {
			throw new BadRequestError("yamlBody must be a string");
		}

		try {
			return await this.db.transaction(async (tx) => {
				await tx
					.insert(escProjects)
					.values({ tenantId, name: input.projectName })
					.onConflictDoNothing({
						target: [escProjects.tenantId, escProjects.name],
					});

				const [proj] = await tx
					.select({ id: escProjects.id })
					.from(escProjects)
					.where(and(eq(escProjects.tenantId, tenantId), eq(escProjects.name, input.projectName)));

				if (!proj) {
					throw new Error("esc_projects row disappeared after upsert");
				}

				const [env] = await tx
					.insert(escEnvironments)
					.values({
						projectId: proj.id,
						name: input.name,
						yamlBody: input.yamlBody,
						currentRevisionNumber: 1,
						createdBy,
					})
					.returning();

				await tx.insert(escEnvironmentRevisions).values({
					environmentId: env.id,
					revisionNumber: 1,
					yamlBody: input.yamlBody,
					createdBy,
				});

				return toEnvInfo(env);
			});
		} catch (err: unknown) {
			if (pgErrorCode(err) === "23505") {
				throw new ConflictError(`Environment ${input.projectName}/${input.name} already exists`);
			}
			throw err;
		}
	}

	async listEnvironments(tenantId: string, projectName: string): Promise<EscEnvironment[]> {
		validateName("project", projectName);
		const rows = await this.db
			.select({ env: escEnvironments })
			.from(escEnvironments)
			.innerJoin(escProjects, eq(escEnvironments.projectId, escProjects.id))
			.where(
				and(
					eq(escProjects.tenantId, tenantId),
					eq(escProjects.name, projectName),
					isNull(escEnvironments.deletedAt),
				),
			)
			.orderBy(escEnvironments.name);
		return rows.map((r) => toEnvInfo(r.env));
	}

	async getEnvironment(
		tenantId: string,
		projectName: string,
		envName: string,
	): Promise<EscEnvironment | null> {
		const row = await findEnvRow(this.db, tenantId, projectName, envName);
		return row ? toEnvInfo(row) : null;
	}

	async updateEnvironment(
		tenantId: string,
		projectName: string,
		envName: string,
		input: UpdateEnvironmentInput,
		updatedBy: string,
	): Promise<EscEnvironment> {
		if (typeof input.yamlBody !== "string") {
			throw new BadRequestError("yamlBody must be a string");
		}

		return await this.db.transaction(async (tx) => {
			const [locked] = await tx
				.select({ env: escEnvironments })
				.from(escEnvironments)
				.innerJoin(escProjects, eq(escEnvironments.projectId, escProjects.id))
				.where(
					and(
						eq(escProjects.tenantId, tenantId),
						eq(escProjects.name, projectName),
						eq(escEnvironments.name, envName),
						isNull(escEnvironments.deletedAt),
					),
				)
				.limit(1)
				.for("update", { of: escEnvironments });

			if (!locked) {
				throw new NotFoundError("Environment", `${projectName}/${envName}`);
			}
			const row = locked.env;

			const nextRevision = row.currentRevisionNumber + 1;
			const now = new Date();

			const [updated] = await tx
				.update(escEnvironments)
				.set({
					yamlBody: input.yamlBody,
					currentRevisionNumber: nextRevision,
					updatedAt: now,
				})
				.where(eq(escEnvironments.id, row.id))
				.returning();

			await tx.insert(escEnvironmentRevisions).values({
				environmentId: row.id,
				revisionNumber: nextRevision,
				yamlBody: input.yamlBody,
				createdBy: updatedBy,
			});

			return toEnvInfo(updated);
		});
	}

	async deleteEnvironment(tenantId: string, projectName: string, envName: string): Promise<void> {
		await this.db.transaction(async (tx) => {
			const row = await findEnvRow(tx, tenantId, projectName, envName);
			if (!row) {
				throw new NotFoundError("Environment", `${projectName}/${envName}`);
			}
			const result = await tx
				.update(escEnvironments)
				.set({ deletedAt: new Date() })
				.where(and(eq(escEnvironments.id, row.id), isNull(escEnvironments.deletedAt)));
			if (result.rowCount === 0) {
				throw new NotFoundError("Environment", `${projectName}/${envName}`);
			}
		});
	}

	async listRevisions(
		tenantId: string,
		projectName: string,
		envName: string,
	): Promise<EscEnvironmentRevision[]> {
		const env = await findEnvRow(this.db, tenantId, projectName, envName);
		if (!env) {
			throw new NotFoundError("Environment", `${projectName}/${envName}`);
		}
		const rows = await this.db
			.select()
			.from(escEnvironmentRevisions)
			.where(eq(escEnvironmentRevisions.environmentId, env.id))
			.orderBy(desc(escEnvironmentRevisions.revisionNumber));
		return rows.map(toRevisionInfo);
	}

	async getRevision(
		tenantId: string,
		projectName: string,
		envName: string,
		revisionNumber: number,
	): Promise<EscEnvironmentRevision | null> {
		const env = await findEnvRow(this.db, tenantId, projectName, envName);
		if (!env) {
			return null;
		}
		const [row] = await this.db
			.select()
			.from(escEnvironmentRevisions)
			.where(
				and(
					eq(escEnvironmentRevisions.environmentId, env.id),
					eq(escEnvironmentRevisions.revisionNumber, revisionNumber),
				),
			)
			.limit(1);
		return row ? toRevisionInfo(row) : null;
	}

	async openSession(
		tenantId: string,
		projectName: string,
		envName: string,
	): Promise<OpenSessionResult> {
		const envRow = await findEnvRow(this.db, tenantId, projectName, envName);
		if (!envRow) {
			throw new NotFoundError("Environment", `${projectName}/${envName}`);
		}

		const [revisionRow] = await this.db
			.select()
			.from(escEnvironmentRevisions)
			.where(
				and(
					eq(escEnvironmentRevisions.environmentId, envRow.id),
					eq(escEnvironmentRevisions.revisionNumber, envRow.currentRevisionNumber),
				),
			)
			.limit(1);
		if (!revisionRow) {
			throw new NotFoundError(
				"EnvironmentRevision",
				`${projectName}/${envName}#${envRow.currentRevisionNumber}`,
			);
		}

		const resolvedImports = await this.resolveImports(
			this.db,
			tenantId,
			projectName,
			envRow.yamlBody,
			new Set<string>(),
			0,
		);

		const result = await this.evaluator.evaluate({
			definition: envRow.yamlBody,
			imports: resolvedImports,
			encryptionKeyHex: this.encryptionKeyHex,
		});

		const errorDiags = result.diagnostics.filter((d) => d.severity === "error");
		if (errorDiags.length > 0 && !result.values) {
			throw new EscEvaluationError(errorDiags);
		}

		const crypto = new AesCryptoService(this.encryptionKeyHex);
		const envFQN = `${tenantId}/${projectName}/${envName}`;
		const plaintext = new TextEncoder().encode(JSON.stringify(result.values));
		const cipherBytes = await crypto.encrypt(plaintext, envFQN);
		const ciphertextBase64 = Buffer.from(cipherBytes).toString("base64");

		const expiresAt = new Date(Date.now() + this.sessionTtlSeconds * 1000);

		const [session] = await this.db
			.insert(escSessions)
			.values({
				environmentId: envRow.id,
				revisionId: revisionRow.id,
				resolvedValuesCiphertext: ciphertextBase64,
				secretPaths: result.secrets,
				expiresAt,
			})
			.returning();

		if (errorDiags.length > 0) {
			throw new EscEvaluationError(errorDiags);
		}

		return {
			sessionId: session.id,
			values: result.values,
			secrets: result.secrets,
			expiresAt: session.expiresAt,
		};
	}

	async getSession(
		tenantId: string,
		projectName: string,
		envName: string,
		sessionId: string,
	): Promise<OpenSessionResult | null> {
		const envRow = await findEnvRow(this.db, tenantId, projectName, envName);
		if (!envRow) {
			return null;
		}

		const [row] = await this.db
			.select()
			.from(escSessions)
			.where(
				and(
					eq(escSessions.id, sessionId),
					eq(escSessions.environmentId, envRow.id),
					isNull(escSessions.closedAt),
					gt(escSessions.expiresAt, new Date()),
				),
			)
			.limit(1);

		if (!row) {
			return null;
		}

		const crypto = new AesCryptoService(this.encryptionKeyHex);
		const envFQN = `${tenantId}/${projectName}/${envName}`;
		const cipherBytes = Buffer.from(row.resolvedValuesCiphertext, "base64");
		const plainBytes = await crypto.decrypt(new Uint8Array(cipherBytes), envFQN);
		const values = JSON.parse(new TextDecoder().decode(plainBytes)) as Record<string, unknown>;

		return {
			sessionId: row.id,
			values,
			secrets: row.secretPaths,
			expiresAt: row.expiresAt,
		};
	}

	private async resolveImports(
		db: TxOrDb,
		tenantId: string,
		contextProjectName: string,
		yamlBody: string,
		visited: Set<string>,
		depth: number,
	): Promise<Record<string, string>> {
		if (depth > MAX_IMPORT_DEPTH) {
			throw new BadRequestError(
				`import_too_deep: exceeded maximum import depth of ${MAX_IMPORT_DEPTH}`,
			);
		}

		const importRefs = extractImports(yamlBody);
		if (importRefs.length === 0) return {};

		const result: Record<string, string> = {};

		await Promise.all(
			importRefs.map(async (ref) => {
				let importProject: string;
				let importEnv: string;
				if (ref.includes("/")) {
					const slashIdx = ref.indexOf("/");
					importProject = ref.slice(0, slashIdx);
					importEnv = ref.slice(slashIdx + 1);
				} else {
					importProject = contextProjectName;
					importEnv = ref;
				}

				const fqn = `${importProject}/${importEnv}`;
				if (visited.has(fqn)) {
					throw new BadRequestError(
						`import_cycle: circular import detected: ${[...visited, fqn].join(" → ")}`,
					);
				}

				const importedRow = await findEnvRow(db, tenantId, importProject, importEnv);
				if (!importedRow) {
					throw new NotFoundError("ImportedEnvironment", fqn);
				}

				const childVisited = new Set(visited);
				childVisited.add(fqn);

				const childImports = await this.resolveImports(
					db,
					tenantId,
					importProject,
					importedRow.yamlBody,
					childVisited,
					depth + 1,
				);

				Object.assign(result, childImports);
				result[fqn] = importedRow.yamlBody;
			}),
		);

		return result;
	}
}

export type {
	EvaluateDiagnostic,
	EvaluatePayload,
	EvaluateResult,
	EvaluatorClient,
} from "./evaluator-client.js";
