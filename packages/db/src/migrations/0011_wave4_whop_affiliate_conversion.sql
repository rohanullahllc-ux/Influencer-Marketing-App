-- Wave 4 (Creator CRM + Whop), Whop half: human-triggered affiliate
-- creation + polling-based conversion tracking, per docs/PRODUCT_VISION.md
-- ("Human-triggered Whop affiliate creation and polling-based conversion
-- tracking") and the mission constraint "no automatic affiliate creation
-- unless human-triggered". Mirrors the Wave 3 outreach-send design
-- deliberately: `credential_provider` already carries a dedicated `whop`
-- slot (migration 0001), and this follows the exact same
-- registry-of-providers / single-active-implementation / Mock-provider
-- shape as packages/domain/src/outreachProvider.ts, not a new pattern.
--
-- Design notes:
-- * `affiliate_status` mirrors `send_status`'s inclusion of an explicit
--   `unknown` outcome — a Whop API call that times out or returns an
--   ambiguous result must never be recorded as `active` (fabricating
--   success) or silently dropped (losing the record that a human
--   triggered this). Never conflate `unknown` with `failed`.
-- * `creator_affiliates` has a workspace-scoped idempotency key
--   (`${creatorId}` or `${campaignId}:${creatorId}` — computed by the
--   domain layer) so a duplicate human click can never create two
--   affiliate relationships for the same creator, same idempotency
--   pattern as `outreach_sends`.
-- * `creator_affiliate_attempts` is an append-only per-attempt history,
--   same shape/purpose as `outreach_send_attempts`.
-- * `whop_conversions` is populated only by the polling reconciliation
--   job against a real (or Mock) Whop provider — never fabricated —
--   deduped on (workspace_id, provider, provider_event_id) exactly like
--   `inbound_messages`' webhook dedupe, since a poll can and will overlap
--   with a previous poll's window. `provenance` is always
--   'verified_external': this data comes directly from Whop's own API,
--   never AI-derived or estimated.
-- * Polling cursor state deliberately reuses the existing
--   `provider_mailbox_state` table from migration 0007 (workspace_id +
--   provider + generic sync_cursor/last_synced_at) rather than adding a
--   near-duplicate table — its columns were already generic, not
--   reply-specific, so a `provider = 'whop'` row is a legitimate reuse,
--   not a repurposing hack.

create type affiliate_status as enum ('pending', 'active', 'failed', 'unknown', 'revoked');

create table creator_affiliates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  creator_id uuid not null references creators(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  provider text not null,
  idempotency_key text not null,
  provider_affiliate_id text,
  affiliate_code text,
  status affiliate_status not null default 'pending',
  status_reason text,
  commercial_metadata jsonb,
  requested_by uuid not null references users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create index creator_affiliates_workspace_idx on creator_affiliates(workspace_id);
create index creator_affiliates_creator_idx on creator_affiliates(workspace_id, creator_id);
create unique index creator_affiliates_workspace_idempotency_idx on creator_affiliates(workspace_id, idempotency_key);

create table creator_affiliate_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  creator_affiliate_id uuid not null references creator_affiliates(id) on delete cascade,
  attempt_number integer not null,
  attempted_at timestamptz not null default now(),
  result affiliate_status not null,
  provider_affiliate_id text,
  error_message text,
  raw_provider_response jsonb
);
create index creator_affiliate_attempts_workspace_idx on creator_affiliate_attempts(workspace_id);
create index creator_affiliate_attempts_affiliate_idx on creator_affiliate_attempts(creator_affiliate_id);

create type whop_conversion_event_type as enum ('click', 'order', 'conversion');

create table whop_conversions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  creator_affiliate_id uuid not null references creator_affiliates(id) on delete cascade,
  provider text not null,
  provider_event_id text not null,
  event_type whop_conversion_event_type not null,
  occurred_at timestamptz not null,
  amount numeric,
  currency text,
  raw_payload jsonb,
  provenance provenance not null default 'verified_external',
  created_at timestamptz not null default now()
);
create index whop_conversions_workspace_idx on whop_conversions(workspace_id);
create index whop_conversions_affiliate_idx on whop_conversions(workspace_id, creator_affiliate_id);
create unique index whop_conversions_workspace_provider_event_idx on whop_conversions(workspace_id, provider, provider_event_id);

-- --- RLS: every tenant-scoped table above gets the exact 0004 policy shape ---

alter table creator_affiliates enable row level security;
alter table creator_affiliates force row level security;
create policy creator_affiliates_isolation on creator_affiliates
  using (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid);

alter table creator_affiliate_attempts enable row level security;
alter table creator_affiliate_attempts force row level security;
create policy creator_affiliate_attempts_isolation on creator_affiliate_attempts
  using (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid);

alter table whop_conversions enable row level security;
alter table whop_conversions force row level security;
create policy whop_conversions_isolation on whop_conversions
  using (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid);
