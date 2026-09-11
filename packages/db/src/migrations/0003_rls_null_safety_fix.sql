-- Fixes a real bug found by the Wave 1 RLS test suite: once a pooled
-- connection has had `app.current_workspace_id` SET LOCAL at least once,
-- Postgres keeps the custom GUC registered on that backend, and a later
-- query on the *same* connection where the value was never (re)set for
-- the current transaction sees '' (empty string), not NULL. The original
-- policy did `current_setting(..., true)::uuid`, which throws
-- "invalid input syntax for type uuid" on '' instead of the intended
-- "matches nothing" behavior — a query on a reused, currently-unscoped
-- connection would error instead of safely returning zero rows.
--
-- Fix: short-circuit the cast when the setting is unset or empty, so an
-- unscoped query on any connection state cleanly denies all rows rather
-- than throwing. This does not change the isolation guarantee — it only
-- makes the "no workspace context set" case fail safe/quiet instead of
-- fail loud/crash, matching the behavior application code actually relies
-- on (e.g. the RLS test asserting a bare, unscoped query returns []).

drop policy workspace_members_isolation on workspace_members;
create policy workspace_members_isolation on workspace_members
  using (
    current_setting('app.current_workspace_id', true) <> ''
    and workspace_id = current_setting('app.current_workspace_id', true)::uuid
  );

drop policy audit_log_isolation on audit_log;
create policy audit_log_isolation on audit_log
  using (
    current_setting('app.current_workspace_id', true) <> ''
    and workspace_id = current_setting('app.current_workspace_id', true)::uuid
  );

drop policy integration_credentials_isolation on integration_credentials;
create policy integration_credentials_isolation on integration_credentials
  using (
    current_setting('app.current_workspace_id', true) <> ''
    and workspace_id = current_setting('app.current_workspace_id', true)::uuid
  );

drop policy notifications_isolation on notifications;
create policy notifications_isolation on notifications
  using (
    current_setting('app.current_workspace_id', true) <> ''
    and workspace_id = current_setting('app.current_workspace_id', true)::uuid
  );
