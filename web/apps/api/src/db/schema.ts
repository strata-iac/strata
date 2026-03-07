import {
	boolean,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

// ── Enums ────────────────────────────────────────────────────────────────────

export const updateKindEnum = pgEnum("update_kind", [
	"update",
	"preview",
	"refresh",
	"destroy",
	"rename",
	"import",
	"resource-import",
]);

export const updateStatusEnum = pgEnum("update_status", [
	"not started",
	"requested",
	"running",
	"failed",
	"succeeded",
	"cancelled",
]);

// ── Tables ───────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
	id: uuid("id").primaryKey().defaultRandom(),
	githubLogin: text("github_login").notNull().unique(),
	displayName: text("display_name"),
	email: text("email"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizations = pgTable("organizations", {
	id: uuid("id").primaryKey().defaultRandom(),
	githubLogin: text("github_login").notNull().unique(),
	displayName: text("display_name"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizationMembers = pgTable(
	"organization_members",
	{
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		role: text("role").notNull().default("member"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [primaryKey({ columns: [table.organizationId, table.userId] })],
);

export const apiTokens = pgTable(
	"api_tokens",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		tokenHash: text("token_hash").notNull().unique(),
		tokenPrefix: text("token_prefix").notNull(),
		description: text("description"),
		lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
		expiresAt: timestamp("expires_at", { withTimezone: true }),
		revokedAt: timestamp("revoked_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [index("idx_api_tokens_user").on(table.userId)],
);

export const projects = pgTable(
	"projects",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		uniqueIndex("projects_organization_id_name_key").on(table.organizationId, table.name),
		index("idx_projects_org").on(table.organizationId),
	],
);

export const stacks = pgTable(
	"stacks",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		projectId: uuid("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		fullyQualifiedName: text("fully_qualified_name").notNull().unique(),
		currentOperationId: uuid("current_operation_id"),
		tags: jsonb("tags").notNull().default({}),
		secretsProvider: text("secrets_provider"),
		lastCheckpointVersion: integer("last_checkpoint_version").notNull().default(0),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		uniqueIndex("stacks_project_id_name_key").on(table.projectId, table.name),
		index("idx_stacks_fqn").on(table.fullyQualifiedName),
	],
);

export const updates = pgTable(
	"updates",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		stackId: uuid("stack_id")
			.notNull()
			.references(() => stacks.id, { onDelete: "cascade" }),
		kind: updateKindEnum("kind").notNull(),
		status: updateStatusEnum("status").notNull().default("not started"),
		programName: text("program_name").notNull().default(""),
		programRuntime: text("program_runtime").notNull().default(""),
		programMain: text("program_main").notNull().default(""),
		programDescription: text("program_description").notNull().default(""),
		config: jsonb("config").notNull().default({}),
		metadata: jsonb("metadata").notNull().default({}),
		leaseToken: text("lease_token"),
		leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
		version: integer("version").notNull().default(0),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		startedAt: timestamp("started_at", { withTimezone: true }),
		completedAt: timestamp("completed_at", { withTimezone: true }),
	},
	(table) => [index("idx_updates_stack").on(table.stackId)],
);

export const updateEvents = pgTable(
	"update_events",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		updateId: uuid("update_id")
			.notNull()
			.references(() => updates.id, { onDelete: "cascade" }),
		sequence: integer("sequence").notNull(),
		timestamp: integer("timestamp").notNull(),
		eventData: jsonb("event_data").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		uniqueIndex("update_events_update_id_sequence_key").on(table.updateId, table.sequence),
		index("idx_update_events_update").on(table.updateId, table.sequence),
	],
);

export const checkpoints = pgTable(
	"checkpoints",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		stackId: uuid("stack_id")
			.notNull()
			.references(() => stacks.id, { onDelete: "cascade" }),
		updateId: uuid("update_id")
			.notNull()
			.references(() => updates.id, { onDelete: "cascade" }),
		version: integer("version").notNull(),
		sequenceNumber: integer("sequence_number").notNull().default(0),
		deployment: jsonb("deployment"),
		isInvalid: boolean("is_invalid").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		index("idx_checkpoints_stack_version").on(table.stackId, table.version),
		index("idx_checkpoints_update").on(table.updateId),
	],
);
