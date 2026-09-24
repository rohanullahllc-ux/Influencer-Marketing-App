-- Wave 3 (Live Outreach + Reply Intelligence): schema for real send
-- execution (against a provider abstraction — see packages/domain/src/
-- outreachProvider.ts) and reply ingestion/classification. RLS policy
-- shape copied exactly from migrations/0004_rls_nullif_fix.sql /
-- 0006_wave2_phase1_domain_foundation.sql, as every migration before this
-- one does — not improvised per table.
--
-- Design notes (see docs/AUTONOMOUS_V1_PROGRESS.md for the full rationale):
-- * `outreach_sends` always references a real `approvals` row (content-
--   pinned) — there is no code path that can create a send without one.
-- * `send_status` includes an explicit `unknown` state (plan's mandatory
--   UNKNOWN/AMBIGUOUS rule): a provider timeout/uncertain result must never
--   be recorded as `sent` or silently treated as `failed`.
-- * `outreach_send_attempts` is an append-only per-attempt history,
--   separate from the current-state summary on `outreach_sends` itself —
--   same append-only-log pattern as `creator_qualifications`/
--   `creator_matches` in migration 0006.
-- * A suggested reply response is never sent directly — it becomes a
--   normal `outreach_drafts` row (see the new nullable FK below) that goes
--   through the exact same approval + safety-gate + send pipeline as any
--   other outreach, rather than a parallel "reply send" path.
-- * `provider_mailbox_state` is intentionally generic (sync_cursor /
--   watch_expires_at), not Gmail-specific column names, so a real Gmail
--   adapter (historyId + watch renewal) or a different provider's
--   equivalent can both use it without a schema change.

create type send_status as enum ('scheduled', 'sending', 'sent', 'failed', 'unknown', 'cancelled');

create table outreach_sends (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  creator_id uuid not null references creators(id) on delete cascade,
  approval_id uuid not null references approvals(id) on delete restrict,
  outreach_step text not null default 'initial',
  -- workspace-scoped idempotency key, computed by the domain layer as
  -- `${campaignId}:${creatorId}:${outreachStep}` — see the unique index
  -- below. This is the atomic idempotency unit named in the product
  -- vision ("keyed to Campaign + Creator + Outreach Step").
  idempotency_key text not null,
  recipient_identity text not null,
  provider text not null,
  provider_message_id text,
  provider_thread_id text,
  scheduled_for timestamptz,
  status send_status not null default 'scheduled',
  status_reason text,
  attempt_count integer not null default 0,
  last_attempted_at timestamptz,
  sent_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index outreach_sends_workspace_idx on outreach_sends(workspace_id);
create index outreach_sends_campaign_idx on outreach_sends(campaign_id);
create index outreach_sends_recipient_idx on outreach_sends(workspace_id, recipient_identity);
create unique index outreach_sends_workspace_idempotency_idx on outreach_sends(workspace_id, idempotency_key);

create table outreach_send_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  outreach_send_id uuid not null references outreach_sends(id) on delete cascade,
  attempt_number integer not null,
  attempted_at timestamptz not null default now(),
  result send_status not null,
  provider_message_id text,
  error_message text,
  raw_provider_response jsonb
);
create index outreach_send_attempts_workspace_idx on outreach_send_attempts(workspace_id);
create index outreach_send_attempts_send_idx on outreach_send_attempts(outreach_send_id);

create type reply_match_status as enum ('matched', 'ambiguous', 'unknown');
create type reply_classification as enum ('interested', 'not_interested', 'needs_human_review');

create table inbound_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  outreach_send_id uuid references outreach_sends(id) on delete set null,
  creator_id uuid references creators(id) on delete set null,
  campaign_id uuid references campaigns(id) on delete set null,
  provider text not null,
  provider_message_id text not null,
  provider_thread_id text,
  from_identity text not null,
  to_identity text,
  subject text,
  body text not null,
  received_at timestamptz not null,
  raw_payload jsonb,
  match_status reply_match_status not null default 'unknown',
  classification reply_classification,
  classification_confidence numeric,
  classification_limitations text,
  extracted_facts jsonb,
  suggested_draft_id uuid,
  created_at timestamptz not null default now()
);
create index inbound_messages_workspace_idx on inbound_messages(workspace_id);
create index inbound_messages_creator_idx on inbound_messages(workspace_id, creator_id);
-- Dedupes duplicate/replayed webhook deliveries of the same provider event.
create unique index inbound_messages_workspace_provider_message_idx on inbound_messages(workspace_id, provider, provider_message_id);

-- Added after inbound_messages exists — a suggested response becomes a
-- normal draft; this FK is how the draft points back at the reply that
-- prompted it (nullable: most drafts are not replies).
alter table outreach_drafts add column in_reply_to_inbound_message_id uuid references inbound_messages(id) on delete set null;
alter table inbound_messages add constraint inbound_messages_suggested_draft_fkey
  foreign key (suggested_draft_id) references outreach_drafts(id) on delete set null;

create table provider_mailbox_state (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  provider text not null,
  sync_cursor text,
  watch_expires_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index provider_mailbox_state_workspace_provider_idx on provider_mailbox_state(workspace_id, provider);

-- --- RLS: every tenant-scoped table above gets the exact 0004 policy shape ---

alter table outreach_sends enable row level security;
alter table outreach_sends force row level security;
create policy outreach_sends_isolation on outreach_sends
  using (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid);

alter table outreach_send_attempts enable row level security;
alter table outreach_send_attempts force row level security;
create policy outreach_send_attempts_isolation on outreach_send_attempts
  using (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid);

alter table inbound_messages enable row level security;
alter table inbound_messages force row level security;
create policy inbound_messages_isolation on inbound_messages
  using (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid);

alter table provider_mailbox_state enable row level security;
alter table provider_mailbox_state force row level security;
create policy provider_mailbox_state_isolation on provider_mailbox_state
  using (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid);
