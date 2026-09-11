-- Row-Level Security (Step 5 §5.1 acceptance criterion: "Every tenant-scoped
-- table created so far has both an RLS policy and an app-layer authorization
-- check"). Enforced with FORCE ROW LEVEL SECURITY so it applies even to the
-- table owner / application DB role — RLS-as-decoration-only would defeat
-- the point. The policy reads the `app.current_workspace_id` session
-- variable, which the application sets once per request/transaction
-- (see packages/db/src/client.ts `withWorkspace`) *after* the app-layer
-- authorization check has already determined the caller may act in that
-- workspace. RLS is defense-in-depth, not a replacement for that check.
--
-- `workspaces` itself is intentionally not included here — it has no
-- workspace_id column (it IS the tenant root). Membership-based visibility
-- for workspace listing is enforced at the application layer, not via RLS.
-- This is documented in packages/db/src/schema.ts.

alter table workspace_members enable row level security;
alter table workspace_members force row level security;
create policy workspace_members_isolation on workspace_members
  using (workspace_id = current_setting('app.current_workspace_id', true)::uuid);

alter table audit_log enable row level security;
alter table audit_log force row level security;
create policy audit_log_isolation on audit_log
  using (workspace_id = current_setting('app.current_workspace_id', true)::uuid);

alter table integration_credentials enable row level security;
alter table integration_credentials force row level security;
create policy integration_credentials_isolation on integration_credentials
  using (workspace_id = current_setting('app.current_workspace_id', true)::uuid);

alter table notifications enable row level security;
alter table notifications force row level security;
create policy notifications_isolation on notifications
  using (workspace_id = current_setting('app.current_workspace_id', true)::uuid);
