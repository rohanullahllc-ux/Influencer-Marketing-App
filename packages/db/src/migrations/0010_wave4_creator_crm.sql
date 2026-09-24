-- Wave 4 (Creator CRM + Whop), CRM half: the operational relationship
-- layer over an existing creator, per docs/PRODUCT_VISION.md's "Creator
-- CRM: lifecycle, relationship status, history, notes, tasks, AI
-- conversation summaries". RLS policy shape copied exactly from every
-- migration before this one — not improvised per table.
--
-- Design notes:
-- * This deliberately does NOT duplicate outreach/reply history — that
--   already exists in full in `outreach_sends`/`inbound_messages` (Wave 3)
--   and is read live by the domain layer, never copied into a CRM table.
--   `creator_relationships` only holds genuinely new state: a human-set
--   lifecycle status and next action.
-- * One row per (workspace_id, creator_id) — a relationship is a property
--   of the creator, not of any one campaign. `creator_tasks` may
--   optionally reference a campaign when a task is campaign-specific.
-- * `creator_notes` is an append-only human note log, same spirit as the
--   append-only evaluation logs in migration 0006 — a note is never
--   edited/deleted, only added.
-- * `creator_conversation_summaries` is AI-derived and append-only (a new
--   row each time it's regenerated, never overwritten) so a later
--   conversation state never silently erases what an earlier summary
--   said — same append-only-log pattern as creator_qualifications/
--   creator_matches. `provenance` reuses the existing shared enum from
--   migration 0006; this table is always 'ai_derived'.
-- * No automatic cross-platform identity merging is built here (or
--   anywhere in this codebase) — the product vision's constraint against
--   automatic creator-identity merging is satisfied by never building an
--   auto-merge feature at all, not by an extra table.

create type creator_relationship_status as enum (
  'new',
  'contacted',
  'in_conversation',
  'negotiating',
  'partnered',
  'declined',
  'unresponsive',
  'do_not_contact'
);

create table creator_relationships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  creator_id uuid not null references creators(id) on delete cascade,
  status creator_relationship_status not null default 'new',
  next_action text,
  next_action_due_at timestamptz,
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index creator_relationships_workspace_creator_idx on creator_relationships(workspace_id, creator_id);
create index creator_relationships_workspace_idx on creator_relationships(workspace_id);

create table creator_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  creator_id uuid not null references creators(id) on delete cascade,
  author_user_id uuid references users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index creator_notes_workspace_idx on creator_notes(workspace_id);
create index creator_notes_creator_idx on creator_notes(workspace_id, creator_id);

create type creator_task_status as enum ('open', 'done', 'cancelled');

create table creator_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  creator_id uuid not null references creators(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  title text not null,
  status creator_task_status not null default 'open',
  due_at timestamptz,
  assigned_to uuid references users(id) on delete set null,
  created_by uuid references users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index creator_tasks_workspace_idx on creator_tasks(workspace_id);
create index creator_tasks_creator_idx on creator_tasks(workspace_id, creator_id);

create table creator_conversation_summaries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  creator_id uuid not null references creators(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  summary text not null,
  key_points jsonb,
  based_on_message_count integer not null default 0,
  provenance provenance not null default 'ai_derived',
  generated_by uuid references users(id) on delete set null,
  generated_at timestamptz not null default now()
);
create index creator_conversation_summaries_workspace_idx on creator_conversation_summaries(workspace_id);
create index creator_conversation_summaries_creator_idx on creator_conversation_summaries(workspace_id, creator_id);

-- --- RLS: every tenant-scoped table above gets the exact 0004 policy shape ---

alter table creator_relationships enable row level security;
alter table creator_relationships force row level security;
create policy creator_relationships_isolation on creator_relationships
  using (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid);

alter table creator_notes enable row level security;
alter table creator_notes force row level security;
create policy creator_notes_isolation on creator_notes
  using (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid);

alter table creator_tasks enable row level security;
alter table creator_tasks force row level security;
create policy creator_tasks_isolation on creator_tasks
  using (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid);

alter table creator_conversation_summaries enable row level security;
alter table creator_conversation_summaries force row level security;
create policy creator_conversation_summaries_isolation on creator_conversation_summaries
  using (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid);
