// @procella/esc — EscService: CRUD + session lifecycle for environments.
//
// P0.2 scaffold: interface + empty PostgresEscService. Implementation lands
// in procella-yj7.6 (P1). Follow the existing service pattern used by
// packages/webhooks (constructor DI with { db }, ProcellaError subclasses,
// tenant-scoped queries).

import type { Database } from "@procella/db";
import type { EvaluatorClient } from "./evaluator-client.js";
import type {
	CreateEnvironmentInput,
	EscEnvironment,
	EscEnvironmentRevision,
	EscProject,
	OpenSessionResult,
	UpdateEnvironmentInput,
} from "./types.js";

export interface EscService {
	// Project management (projects are created implicitly on first env create)
	listProjects(tenantId: string): Promise<EscProject[]>;

	// Environment CRUD
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

	// Revisions
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

	// Sessions ("open" flow)
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
	/** 32-byte key as hex string. Sourced from PROCELLA_ENCRYPTION_KEY. */
	encryptionKeyHex: string;
	/** Session TTL in seconds. Default: 3600 (1h). */
	sessionTtlSeconds?: number;
}

/**
 * PostgreSQL + Go Lambda backed implementation.
 *
 * Scaffold only — methods are stubs. Real implementation lands in
 * procella-yj7.6 (CRUD), .14 (open flow), and .32 (session GC).
 */
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

	private unimplemented(method: string, issue: string): never {
		throw new Error(
			`EscService.${method} not implemented — see ${issue}. ` +
				`deps: db=${!!this.db} evaluator=${!!this.evaluator} ` +
				`keyHexLen=${this.encryptionKeyHex.length} ttl=${this.sessionTtlSeconds}s`,
		);
	}

	async listProjects(_tenantId: string): Promise<EscProject[]> {
		this.unimplemented("listProjects", "procella-yj7.6");
	}

	async createEnvironment(
		_tenantId: string,
		_input: CreateEnvironmentInput,
		_createdBy: string,
	): Promise<EscEnvironment> {
		this.unimplemented("createEnvironment", "procella-yj7.6");
	}

	async listEnvironments(_tenantId: string, _projectName: string): Promise<EscEnvironment[]> {
		this.unimplemented("listEnvironments", "procella-yj7.6");
	}

	async getEnvironment(
		_tenantId: string,
		_projectName: string,
		_envName: string,
	): Promise<EscEnvironment | null> {
		this.unimplemented("getEnvironment", "procella-yj7.6");
	}

	async updateEnvironment(
		_tenantId: string,
		_projectName: string,
		_envName: string,
		_input: UpdateEnvironmentInput,
		_updatedBy: string,
	): Promise<EscEnvironment> {
		this.unimplemented("updateEnvironment", "procella-yj7.6");
	}

	async deleteEnvironment(
		_tenantId: string,
		_projectName: string,
		_envName: string,
	): Promise<void> {
		this.unimplemented("deleteEnvironment", "procella-yj7.6");
	}

	async listRevisions(
		_tenantId: string,
		_projectName: string,
		_envName: string,
	): Promise<EscEnvironmentRevision[]> {
		this.unimplemented("listRevisions", "procella-yj7.6");
	}

	async getRevision(
		_tenantId: string,
		_projectName: string,
		_envName: string,
		_revisionNumber: number,
	): Promise<EscEnvironmentRevision | null> {
		this.unimplemented("getRevision", "procella-yj7.6");
	}

	async openSession(
		_tenantId: string,
		_projectName: string,
		_envName: string,
	): Promise<OpenSessionResult> {
		this.unimplemented("openSession", "procella-yj7.14");
	}

	async getSession(
		_tenantId: string,
		_projectName: string,
		_envName: string,
		_sessionId: string,
	): Promise<OpenSessionResult | null> {
		this.unimplemented("getSession", "procella-yj7.14");
	}
}

// Re-exports so callers can do `import { EscService } from "@procella/esc"`
// without dipping into sub-paths (matches webhooks convention).
export type {
	EvaluateDiagnostic,
	EvaluatePayload,
	EvaluateResult,
	EvaluatorClient,
} from "./evaluator-client.js";
