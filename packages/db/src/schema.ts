import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  jsonb,
  primaryKey,
  index,
  numeric,
  integer,
  boolean,
  date,
} from "drizzle-orm/pg-core";

/**
 * Foundation schema (Step 5 §5.1), extended by Wave 2 Phase 1 (revised plan
 * §6/§14): the tenant/workspace/auth/audit/credentials tables from Wave 1
 * plus the Phase 1 domain/DB foundation — schema and RLS only, for every
 * entity the rest of Wave 2 will need (products, product intelligence,
 * creators, campaigns, templates, qualification/matching, outreach drafts/
 * approvals, safety/suppressions). Phase 1 intentionally adds no API, UI,
 * worker jobs, or domain business logic beyond what's needed to compile —
 * those arrive with each entity's own later phase (see docs/PRODUCT_VISION.md
 * build plan, Phase 1 scope/acceptance criteria).
 *
 * RLS: every table below that carries workspace_id has a matching RLS
 * policy in a migrations/*.sql file, enforced *in addition to* (never
 * instead of) the application-layer checks in packages/auth. `workspaces`
 * itself has no workspace_id column (it IS the tenant root) so it is not
 * RLS-scoped the same way; membership is checked at the application layer
 * when listing/joining workspaces. This is a deliberate, documented
 * choice, not an oversight.
 *
 * As with Wave 1, this file only defines the Drizzle mirror used for
 * type-safe queries — the actual DDL (tables, RLS policies, unique/partial
 * indexes) lives exclusively in the hand-written migrations/*.sql files;
 * nothing here is pushed/generated into the database.
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
  // Wave 2 Phase 1 (plan §14.7): workspace-wide safety kill switch, read by
  // the Phase 7 safety gate. Defaults true so existing/new workspaces are
  // never accidentally blocked before that gate exists to unblock them.
  sendingEnabled: boolean("sending_enabled").notNull().default(true),
  // Wave 2 Phase 1 (plan §14.7): fallback timezone for schedule-validity
  // checks (Phase 7) when a creator's own timezone is unknown. Nullable —
  // no default is guessed here; a workspace without one configured simply
  // has no fallback until an Owner/Admin sets it.
  defaultTimezone: text("default_timezone"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  // Wave 2 Phase 0 (plan §5, §14.1): bcrypt hash, null until the member
  // completes one-time account setup. Never a reversible AES payload —
  // see @rdv/lib password.ts vs encryption.ts.
  passwordHash: text("password_hash"),
  // One-time setup token (SHA-256 hash only, see @rdv/lib setupToken.ts).
  // Both null once consumed or if never issued.
  setupTokenHash: text("setup_token_hash"),
  setupTokenExpiresAt: timestamp("setup_token_expires_at", { withTimezone: true }),
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

/**
 * ---------------------------------------------------------------------
 * Wave 2 Phase 1 — Domain / DB Foundation (revised plan §6, §14.2–§14.7).
 *
 * Schema and RLS only for every entity the rest of Wave 2 needs. No API,
 * UI, worker jobs, or business logic beyond what's needed to compile —
 * that arrives with each entity's own later phase. A shared `provenance`
 * enum is used everywhere the plan's provenance/confidence principle
 * applies (never conflated with `status` or `confidence`), instead of a
 * one-off enum per table.
 * ---------------------------------------------------------------------
 */

export const provenanceEnum = pgEnum("provenance", [
  "verified_external",
  "human_entered",
  "ai_derived",
  "estimated",
]);

// --- 14.2 Product + Product Intelligence ---------------------------------

export const productStatusEnum = pgEnum("product_status", ["draft", "active", "archived"]);

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    status: productStatusEnum("status").notNull().default("draft"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byWorkspace: index("products_workspace_idx").on(t.workspaceId),
  })
);

export const productIntelligenceStatusEnum = pgEnum("product_intelligence_status", [
  "draft",
  "approved",
  "superseded",
]);

/**
 * No back-reference from `products` (plan §14.2 — avoids the circular FK
 * of the first draft). "Which version is approved" is a query against
 * this table's `status`, backed by a partial unique index in the
 * migration (`unique (product_id) where status = 'approved'`), not a
 * pointer column on `products`. `origin` never changes once set — it
 * records provenance only; `edited_by`/`edited_at` record human editing;
 * `status`/`approved_by`/`approved_at` record authoritative-version state.
 * These three concerns are deliberately three separate sets of columns.
 */
export const productIntelligence = pgTable(
  "product_intelligence",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    origin: provenanceEnum("origin").notNull().default("ai_derived"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    editedBy: uuid("edited_by").references(() => users.id, { onDelete: "set null" }),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    idealCustomer: jsonb("ideal_customer"),
    problems: jsonb("problems"),
    benefits: jsonb("benefits"),
    niches: jsonb("niches"),
    subNiches: jsonb("sub_niches"),
    creatorTypes: jsonb("creator_types"),
    countries: jsonb("countries"),
    languages: jsonb("languages"),
    topics: jsonb("topics"),
    keywords: jsonb("keywords"),
    audienceRationale: text("audience_rationale"),
    confidence: numeric("confidence"),
    status: productIntelligenceStatusEnum("status").notNull().default("draft"),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byWorkspace: index("product_intelligence_workspace_idx").on(t.workspaceId),
    byProduct: index("product_intelligence_product_idx").on(t.productId),
  })
);

// --- 14.3 Creators ---------------------------------------------------------

export const creatorPlatformEnum = pgEnum("creator_platform", ["youtube", "instagram", "manual"]);
export const creatorStatusEnum = pgEnum("creator_status", ["active", "inactive", "do_not_contact"]);
export const creatorSourceEnum = pgEnum("creator_source", ["youtube_api", "manual"]);

export const creators = pgTable(
  "creators",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    platform: creatorPlatformEnum("platform").notNull(),
    // Unique per (workspace_id, platform, platform_channel_id) — see the
    // migration; nullable here since a manual entry may not have one yet.
    platformChannelId: text("platform_channel_id"),
    handle: text("handle"),
    displayName: text("display_name"),
    channelUrl: text("channel_url"),
    subscriberCount: integer("subscriber_count"),
    avgViews: integer("avg_views"),
    engagementRate: numeric("engagement_rate"),
    country: text("country"),
    language: text("language"),
    niche: text("niche"),
    subNiche: text("sub_niche"),
    creatorType: text("creator_type"),
    timezone: text("timezone"),
    status: creatorStatusEnum("status").notNull().default("active"),
    source: creatorSourceEnum("source").notNull(),
    provenance: provenanceEnum("provenance").notNull(),
    confidence: numeric("confidence"),
    // Never guessed (plan §14.3) — null unless a real address is known.
    contactEmail: text("contact_email"),
    discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull().defaultNow(),
    lastEnrichedAt: timestamp("last_enriched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byWorkspace: index("creators_workspace_idx").on(t.workspaceId),
  })
);

// --- 14.5 Campaign Foundation ----------------------------------------------
// (numbered after §14.4 in the plan's own document order, but created here
// before Qualification/Matching since those tables reference campaigns.)

export const campaignStatusEnum = pgEnum("campaign_status", ["draft", "active", "paused", "archived"]);

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    objective: text("objective"),
    targetGeography: jsonb("target_geography"),
    targetLanguages: jsonb("target_languages"),
    creatorTypes: jsonb("creator_types"),
    qualificationThresholds: jsonb("qualification_thresholds"),
    nicheRequirements: jsonb("niche_requirements"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    outreachStrategy: text("outreach_strategy"),
    sendingLimits: jsonb("sending_limits"),
    // First-class column, not buried in jsonb (plan §14.5 — a named locked
    // safeguard that must be directly queryable/auditable).
    firstSendCap: integer("first_send_cap"),
    followUpRules: jsonb("follow_up_rules"),
    // Wave 2/Wave 3 scheduling split (plan §19): the campaign's configured
    // allowed sending window, validated by a Phase 7 deterministic check.
    sendingWindow: jsonb("sending_window"),
    status: campaignStatusEnum("status").notNull().default("draft"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byWorkspace: index("campaigns_workspace_idx").on(t.workspaceId),
    byProduct: index("campaigns_product_idx").on(t.productId),
  })
);

export const campaignCreatorStatusEnum = pgEnum("campaign_creator_status", [
  "shortlisted",
  "selected",
  "excluded",
]);

export const campaignCreators = pgTable(
  "campaign_creators",
  {
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    creatorId: uuid("creator_id").notNull().references(() => creators.id, { onDelete: "cascade" }),
    status: campaignCreatorStatusEnum("status").notNull().default("shortlisted"),
    addedBy: uuid("added_by").references(() => users.id, { onDelete: "set null" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.campaignId, t.creatorId] }),
    byWorkspace: index("campaign_creators_workspace_idx").on(t.workspaceId),
  })
);

export const templateStatusEnum = pgEnum("template_status", ["draft", "active", "archived"]);

export const outreachTemplates = pgTable(
  "outreach_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    subject: text("subject"),
    body: text("body"),
    variables: jsonb("variables"),
    status: templateStatusEnum("status").notNull().default("draft"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byWorkspace: index("outreach_templates_workspace_idx").on(t.workspaceId),
  })
);

// Simple V1 multi-template assignment by segment (plan §14.5) — not A/B
// testing infrastructure. Unique (campaign_id, assignment_segment) in the
// migration.
export const campaignTemplates = pgTable(
  "campaign_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").notNull().references(() => outreachTemplates.id, { onDelete: "cascade" }),
    assignmentSegment: text("assignment_segment").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byWorkspace: index("campaign_templates_workspace_idx").on(t.workspaceId),
    byCampaign: index("campaign_templates_campaign_idx").on(t.campaignId),
  })
);

// --- 14.4 Qualification + Matching -----------------------------------------
// Append-only evaluation log (plan §14.4) — re-evaluating a creator inserts
// a new row rather than overwriting the previous one, so "why did this
// creator qualify/match at that time" stays answerable. "Current" is
// whichever row is latest by (campaign_id, creator_id, evaluated_at/
// computed_at) — a query pattern, not a uniqueness constraint.

export const creatorQualifications = pgTable(
  "creator_qualifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    creatorId: uuid("creator_id").notNull().references(() => creators.id, { onDelete: "cascade" }),
    // Snapshot of the campaign's thresholds/measured creator values *at
    // evaluation time*, so a later threshold change never retroactively
    // changes what an old evaluation meant.
    thresholdsSnapshot: jsonb("thresholds_snapshot").notNull(),
    measuredValues: jsonb("measured_values").notNull(),
    passed: boolean("passed").notNull(),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byWorkspace: index("creator_qualifications_workspace_idx").on(t.workspaceId),
    byCampaignCreatorEvaluated: index("creator_qualifications_campaign_creator_idx").on(
      t.campaignId,
      t.creatorId,
      t.evaluatedAt
    ),
  })
);

export const creatorMatches = pgTable(
  "creator_matches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    creatorId: uuid("creator_id").notNull().references(() => creators.id, { onDelete: "cascade" }),
    score: numeric("score").notNull(),
    // A score is never shown without its explanation (plan §10 tests) —
    // both are required columns, never optional companions.
    explanation: text("explanation").notNull(),
    factors: jsonb("factors"),
    limitations: text("limitations"),
    provenance: provenanceEnum("provenance").notNull().default("ai_derived"),
    confidence: numeric("confidence"),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byWorkspace: index("creator_matches_workspace_idx").on(t.workspaceId),
    byCampaignCreatorComputed: index("creator_matches_campaign_creator_idx").on(
      t.campaignId,
      t.creatorId,
      t.computedAt
    ),
  })
);

// --- 14.6 Outreach + Approval -----------------------------------------------

export const outreachDraftStatusEnum = pgEnum("outreach_draft_status", [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "edited",
  "stale",
]);

export const outreachDrafts = pgTable(
  "outreach_drafts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    creatorId: uuid("creator_id").notNull().references(() => creators.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").references(() => outreachTemplates.id, { onDelete: "set null" }),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    // Snapshot of what fed the AI call — plan §14.6.
    generationInput: jsonb("generation_input"),
    provenance: provenanceEnum("provenance").notNull().default("ai_derived"),
    status: outreachDraftStatusEnum("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byWorkspace: index("outreach_drafts_workspace_idx").on(t.workspaceId),
  })
);

export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "approved",
  "rejected",
  "returned_for_edit",
  "invalidated",
]);

/**
 * Content-pinned approval (plan §11/§14.6): `exact_subject`/`exact_body`
 * are full text snapshots, never pointers to the mutable draft — approved/
 * sent content must be independently verifiable even if the draft or its
 * template later changes. `content_hash` is computed over this snapshot,
 * not the draft, so there is no race window between "approve" and "edit."
 */
export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    outreachDraftId: uuid("outreach_draft_id")
      .notNull()
      .references(() => outreachDrafts.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    creatorId: uuid("creator_id").notNull().references(() => creators.id, { onDelete: "cascade" }),
    exactSubject: text("exact_subject").notNull(),
    exactBody: text("exact_body").notNull(),
    contentHash: text("content_hash").notNull(),
    status: approvalStatusEnum("status").notNull().default("pending"),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNotes: text("decision_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byWorkspace: index("approvals_workspace_idx").on(t.workspaceId),
  })
);

// --- 14.7 Safety (schema only — Phase 7 builds the gate/dry-run logic) -----

// Keyed to normalized contact identity, not a creator FK — survives
// creator-record merges (plan §14.7).
export const suppressions = pgTable(
  "suppressions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    normalizedIdentity: text("normalized_identity").notNull(),
    reason: text("reason"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byWorkspace: index("suppressions_workspace_idx").on(t.workspaceId),
  })
);

export const dryRunEvaluations = pgTable(
  "dry_run_evaluations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    triggeredBy: uuid("triggered_by").references(() => users.id, { onDelete: "set null" }),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
    summary: jsonb("summary"),
  },
  (t) => ({
    byWorkspace: index("dry_run_evaluations_workspace_idx").on(t.workspaceId),
  })
);

// One row per evaluated creator (plan §14.7). Carries its own workspace_id
// (denormalized from the parent dry_run_evaluations row) so it follows the
// same direct-column RLS policy shape as every other tenant table, rather
// than a join-dependent policy improvised just for this one child table.
export const dryRunEvaluationResults = pgTable(
  "dry_run_evaluation_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    dryRunEvaluationId: uuid("dry_run_evaluation_id")
      .notNull()
      .references(() => dryRunEvaluations.id, { onDelete: "cascade" }),
    creatorId: uuid("creator_id").notNull().references(() => creators.id, { onDelete: "cascade" }),
    approvalId: uuid("approval_id").references(() => approvals.id, { onDelete: "set null" }),
    eligible: boolean("eligible").notNull(),
    blockReasons: jsonb("block_reasons"),
  },
  (t) => ({
    byWorkspace: index("dry_run_evaluation_results_workspace_idx").on(t.workspaceId),
    byEvaluation: index("dry_run_evaluation_results_evaluation_idx").on(t.dryRunEvaluationId),
  })
);
