-- Wave 2 Phase 1 (revised plan §6, §14.2-§14.7): Domain / DB Foundation.
-- Schema and RLS only for every entity the rest of Wave 2 needs — no
-- API/UI/worker code depends on any of this yet. See packages/db/src/
-- schema.ts for the Drizzle mirror of this DDL used for type-safe queries.
--
-- RLS policy shape is copied exactly from migrations/0004_rls_nullif_fix.sql
-- (nullif(current_setting(...), '')::uuid — an unscoped connection sees zero
-- rows, never an error) for every new table below. Not improvised per table.

alter table workspaces add column sending_enabled boolean not null default true;
alter table workspaces add column default_timezone text;

create type provenance as enum ('verified_external', 'human_entered', 'ai_derived', 'estimated');

-- --- 14.2 Product + Product Intelligence ------------------------------

create type product_status as enum ('draft', 'active', 'archived');

create table products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  description text,
  status product_status not null default 'draft',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index products_workspace_idx on products(workspace_id);

create type product_intelligence_status as enum ('draft', 'approved', 'superseded');

create table product_intelligence (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  origin provenance not null default 'ai_derived',
  generated_at timestamptz not null default now(),
  edited_by uuid references users(id) on delete set null,
  edited_at timestamptz,
  ideal_customer jsonb,
  problems jsonb,
  benefits jsonb,
  niches jsonb,
  sub_niches jsonb,
  creator_types jsonb,
  countries jsonb,
  languages jsonb,
  topics jsonb,
  keywords jsonb,
  audience_rationale text,
  confidence numeric,
  status product_intelligence_status not null default 'draft',
  approved_by uuid references users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
create index product_intelligence_workspace_idx on product_intelligence(workspace_id);
create index product_intelligence_product_idx on product_intelligence(product_id);
-- At most one approved version per product (plan §14.2) — enforced at the
-- database level, no back-reference from `products` needed.
create unique index product_intelligence_one_approved_idx on product_intelligence(product_id) where status = 'approved';

-- --- 14.3 Creators ------------------------------------------------------

create type creator_platform as enum ('youtube', 'instagram', 'manual');
create type creator_status as enum ('active', 'inactive', 'do_not_contact');
create type creator_source as enum ('youtube_api', 'manual');

create table creators (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  platform creator_platform not null,
  platform_channel_id text,
  handle text,
  display_name text,
  channel_url text,
  subscriber_count integer,
  avg_views integer,
  engagement_rate numeric,
  country text,
  language text,
  niche text,
  sub_niche text,
  creator_type text,
  timezone text,
  status creator_status not null default 'active',
  source creator_source not null,
  provenance provenance not null,
  confidence numeric,
  contact_email text,
  discovered_at timestamptz not null default now(),
  last_enriched_at timestamptz,
  created_at timestamptz not null default now()
);
create index creators_workspace_idx on creators(workspace_id);
-- Prevents duplicate ingestion on re-run (plan §8 Phase 3 acceptance
-- criteria); multiple NULL platform_channel_id values remain distinct
-- under Postgres unique-constraint semantics, so manual entries are unaffected.
create unique index creators_workspace_platform_channel_idx on creators(workspace_id, platform, platform_channel_id);

-- --- 14.5 Campaign Foundation --------------------------------------------

create type campaign_status as enum ('draft', 'active', 'paused', 'archived');

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  name text not null,
  objective text,
  target_geography jsonb,
  target_languages jsonb,
  creator_types jsonb,
  qualification_thresholds jsonb,
  niche_requirements jsonb,
  start_date date,
  end_date date,
  outreach_strategy text,
  sending_limits jsonb,
  first_send_cap integer,
  follow_up_rules jsonb,
  sending_window jsonb,
  status campaign_status not null default 'draft',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index campaigns_workspace_idx on campaigns(workspace_id);
create index campaigns_product_idx on campaigns(product_id);

create type campaign_creator_status as enum ('shortlisted', 'selected', 'excluded');

create table campaign_creators (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  creator_id uuid not null references creators(id) on delete cascade,
  status campaign_creator_status not null default 'shortlisted',
  added_by uuid references users(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (campaign_id, creator_id)
);
create index campaign_creators_workspace_idx on campaign_creators(workspace_id);

create type template_status as enum ('draft', 'active', 'archived');

create table outreach_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  subject text,
  body text,
  variables jsonb,
  status template_status not null default 'draft',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index outreach_templates_workspace_idx on outreach_templates(workspace_id);

create table campaign_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  template_id uuid not null references outreach_templates(id) on delete cascade,
  assignment_segment text not null,
  created_at timestamptz not null default now()
);
create index campaign_templates_workspace_idx on campaign_templates(workspace_id);
create index campaign_templates_campaign_idx on campaign_templates(campaign_id);
-- Simple V1 multi-template assignment by segment (plan §14.5) — one
-- template per campaign+segment, not A/B testing infrastructure.
create unique index campaign_templates_campaign_segment_idx on campaign_templates(campaign_id, assignment_segment);

-- --- 14.4 Qualification + Matching ---------------------------------------
-- Append-only evaluation log — no uniqueness constraint on
-- (campaign_id, creator_id): re-evaluating inserts a new row rather than
-- overwriting the previous one, so historical "why" stays queryable.
-- "Current" is resolved by the application via `order by ... desc limit 1`
-- against the indexes below, not by a database constraint.

create table creator_qualifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  creator_id uuid not null references creators(id) on delete cascade,
  thresholds_snapshot jsonb not null,
  measured_values jsonb not null,
  passed boolean not null,
  evaluated_at timestamptz not null default now()
);
create index creator_qualifications_workspace_idx on creator_qualifications(workspace_id);
create index creator_qualifications_campaign_creator_idx on creator_qualifications(campaign_id, creator_id, evaluated_at desc);

create table creator_matches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  creator_id uuid not null references creators(id) on delete cascade,
  score numeric not null,
  explanation text not null,
  factors jsonb,
  limitations text,
  provenance provenance not null default 'ai_derived',
  confidence numeric,
  computed_at timestamptz not null default now()
);
create index creator_matches_workspace_idx on creator_matches(workspace_id);
create index creator_matches_campaign_creator_idx on creator_matches(campaign_id, creator_id, computed_at desc);

-- --- 14.6 Outreach + Approval ---------------------------------------------

create type outreach_draft_status as enum ('draft', 'pending_approval', 'approved', 'rejected', 'edited', 'stale');

create table outreach_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  creator_id uuid not null references creators(id) on delete cascade,
  template_id uuid references outreach_templates(id) on delete set null,
  subject text not null,
  body text not null,
  generation_input jsonb,
  provenance provenance not null default 'ai_derived',
  status outreach_draft_status not null default 'draft',
  created_at timestamptz not null default now()
);
create index outreach_drafts_workspace_idx on outreach_drafts(workspace_id);

create type approval_status as enum ('pending', 'approved', 'rejected', 'returned_for_edit', 'invalidated');

create table approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  outreach_draft_id uuid not null references outreach_drafts(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  creator_id uuid not null references creators(id) on delete cascade,
  exact_subject text not null,
  exact_body text not null,
  content_hash text not null,
  status approval_status not null default 'pending',
  decided_by uuid references users(id) on delete set null,
  decided_at timestamptz,
  decision_notes text,
  created_at timestamptz not null default now()
);
create index approvals_workspace_idx on approvals(workspace_id);

-- --- 14.7 Safety (schema only — Phase 7 builds the gate/dry-run logic) ---

create table suppressions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  normalized_identity text not null,
  reason text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index suppressions_workspace_idx on suppressions(workspace_id);

create table dry_run_evaluations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  triggered_by uuid references users(id) on delete set null,
  evaluated_at timestamptz not null default now(),
  summary jsonb
);
create index dry_run_evaluations_workspace_idx on dry_run_evaluations(workspace_id);

create table dry_run_evaluation_results (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  dry_run_evaluation_id uuid not null references dry_run_evaluations(id) on delete cascade,
  creator_id uuid not null references creators(id) on delete cascade,
  approval_id uuid references approvals(id) on delete set null,
  eligible boolean not null,
  block_reasons jsonb
);
create index dry_run_evaluation_results_workspace_idx on dry_run_evaluation_results(workspace_id);
create index dry_run_evaluation_results_evaluation_idx on dry_run_evaluation_results(dry_run_evaluation_id);

-- --- RLS: every tenant-scoped table above gets the exact 0004 policy shape ---

alter table products enable row level security;
alter table products force row level security;
create policy products_isolation on products
  using (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid);

alter table product_intelligence enable row level security;
alter table product_intelligence force row level security;
create policy product_intelligence_isolation on product_intelligence
  using (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid);

alter table creators enable row level security;
alter table creators force row level security;
create policy creators_isolation on creators
  using (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid);

alter table campaigns enable row level security;
alter table campaigns force row level security;
create policy campaigns_isolation on campaigns
  using (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid);

alter table campaign_creators enable row level security;
alter table campaign_creators force row level security;
create policy campaign_creators_isolation on campaign_creators
  using (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid);

alter table outreach_templates enable row level security;
alter table outreach_templates force row level security;
create policy outreach_templates_isolation on outreach_templates
  using (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid);

alter table campaign_templates enable row level security;
alter table campaign_templates force row level security;
create policy campaign_templates_isolation on campaign_templates
  using (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid);

alter table creator_qualifications enable row level security;
alter table creator_qualifications force row level security;
create policy creator_qualifications_isolation on creator_qualifications
  using (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid);

alter table creator_matches enable row level security;
alter table creator_matches force row level security;
create policy creator_matches_isolation on creator_matches
  using (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid);

alter table outreach_drafts enable row level security;
alter table outreach_drafts force row level security;
create policy outreach_drafts_isolation on outreach_drafts
  using (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid);

alter table approvals enable row level security;
alter table approvals force row level security;
create policy approvals_isolation on approvals
  using (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid);

alter table suppressions enable row level security;
alter table suppressions force row level security;
create policy suppressions_isolation on suppressions
  using (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid);

alter table dry_run_evaluations enable row level security;
alter table dry_run_evaluations force row level security;
create policy dry_run_evaluations_isolation on dry_run_evaluations
  using (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid);

alter table dry_run_evaluation_results enable row level security;
alter table dry_run_evaluation_results force row level security;
create policy dry_run_evaluation_results_isolation on dry_run_evaluation_results
  using (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid);
