-- Wave 2 Phase 0 (plan §5, §14.1): minimal real auth for the app.
-- `users` is not workspace-scoped (see schema.ts's own note on why it has
-- no RLS policy — it's not a tenant table), so no RLS change here.

alter table users add column password_hash text;
alter table users add column setup_token_hash text;
alter table users add column setup_token_expires_at timestamptz;

-- Setup-token consumption looks up a user by the token's hash directly
-- (see @rdv/lib setupToken.ts) — this must be fast and is looked up before
-- any workspace/session context exists.
create index users_setup_token_hash_idx on users(setup_token_hash) where setup_token_hash is not null;
