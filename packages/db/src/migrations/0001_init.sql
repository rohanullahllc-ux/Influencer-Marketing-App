-- Foundation schema (Step 5 §5.1). See packages/db/src/schema.ts for the
-- Drizzle mirror of this DDL used for type-safe queries.

create extension if not exists pgcrypto;

create type workspace_role as enum ('owner', 'admin', 'member_operator');
create type workspace_status as enum ('active', 'archived');
create type credential_provider as enum ('youtube', 'outreach_provider', 'whop', 'anthropic');
create type credential_status as enum ('active', 'revoked', 'expired');
create type notification_type as enum ('stub_test', 'creator_replied', 'creator_interested', 'needs_human_review', 'task_waiting');
create type notification_channel as enum ('in_app', 'email');

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status workspace_status not null default 'active',
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  created_at timestamptz not null default now()
);

create table workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role workspace_role not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_workspace_idx on workspace_members(workspace_id);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  actor_user_id uuid references users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_log_workspace_idx on audit_log(workspace_id);
create index audit_log_workspace_created_idx on audit_log(workspace_id, created_at);

create table integration_credentials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  provider credential_provider not null,
  status credential_status not null default 'active',
  encrypted_iv text not null,
  encrypted_auth_tag text not null,
  encrypted_ciphertext text not null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);
create index integration_credentials_workspace_idx on integration_credentials(workspace_id);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  type notification_type not null,
  channel notification_channel not null,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_workspace_user_idx on notifications(workspace_id, user_id);
