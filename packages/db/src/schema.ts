import { pgTable, pgEnum, uuid, text, timestamp, jsonb, primaryKey, index } from "drizzle-orm/pg-core";

/**
 * Foundation schema (Step 5 §5.1). Only the tenant/workspace/auth/audit/
 * credentials tables are defined here — product, creator, campaign, etc.
 * entities are out of scope for Wave 1 by design (see docs/WAVE_1_REPORT.md
 * "Wave 1 must NOT build product features").
 *
 * RLS: every table below that carries workspace_id has a matching RLS
 * policy in migrations/0002_rls.sql, enforced *in addition to* (never
 * instead of) the application-layer checks in packages/auth. `workspaces`
 * itself has no workspace_id column (it IS the tenant root) so it is not
 * RLS-scoped the same way; membership is checked at the application layer
 * when listing/joining workspaces. This is a deliberate, documented
 * choice, not an oversight.
 */

export const workspaceRoleEnum = pgEnum("workspace_role", ["owner", "admin", "member_operator"]);
export const workspaceStatusEnum = pgEnum("workspace_status", ["active", "archived"]);
export const credentialProviderEnum = pgEnum("credential_provider", [
  "youtube",
  "outreach_provider",
  "whop",
  "anthropic",
]);
export const credentialStatusEnum = pgEnum("credential_status", ["active", "revoked", "expired"]);

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  status: workspaceStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: workspaceRoleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.workspaceId, t.userId] }),
    byWorkspace: index("workspace_members_workspace_idx").on(t.workspaceId),
  })
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byWorkspace: index("audit_log_workspace_idx").on(t.workspaceId),
    byWorkspaceCreated: index("audit_log_workspace_created_idx").on(t.workspaceId, t.createdAt),
  })
);

export const integrationCredentials = pgTable(
  "integration_credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    provider: credentialProviderEnum("provider").notNull(),
    status: credentialStatusEnum("status").notNull().default("active"),
    // Encrypted payload (see @rdv/lib encryptSecret/decryptSecret) — never a plaintext column.
    encryptedIv: text("encrypted_iv").notNull(),
    encryptedAuthTag: text("encrypted_auth_tag").notNull(),
    encryptedCiphertext: text("encrypted_ciphertext").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
  },
  (t) => ({
    byWorkspace: index("integration_credentials_workspace_idx").on(t.workspaceId),
  })
);

/**
 * Notification-dispatch foundation (Step 5C.3.3 / 5D.5: generic
 * infrastructure in Foundation, triggered by business events in later
 * waves). Only the delivery-record table lives here in Wave 1; nothing
 * calls it with real business events until Reply Intelligence (5.7) and
 * Creator CRM (5.8) exist.
 */
export const notificationTypeEnum = pgEnum("notification_type", [
  "stub_test",
  "creator_replied",
  "creator_interested",
  "needs_human_review",
  "task_waiting",
]);
export const notificationChannelEnum = pgEnum("notification_channel", ["in_app", "email"]);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    channel: notificationChannelEnum("channel").notNull(),
    payload: jsonb("payload").notNull().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byWorkspaceUser: index("notifications_workspace_user_idx").on(t.workspaceId, t.userId),
  })
);
