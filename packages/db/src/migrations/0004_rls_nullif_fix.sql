-- 0003's `<> '' and ... ::uuid` guard still failed under real testing:
-- Postgres's planner is not guaranteed to evaluate AND operands in
-- left-to-right order for a USING qual (confirmed directly: `x <> '' and
-- (select 1/0)` still errors from the right operand), so the cast could
-- still be reached with '' and throw. The correct, order-independent fix
-- is `nullif(value, '')::uuid`: nullif() converts '' to SQL NULL *before*
-- the cast runs, so the cast always receives either a real UUID string or
-- NULL (casting NULL never errors), and `workspace_id = NULL` is simply
-- false/unknown — no error, no matching rows, exactly the intended
-- "unscoped connection sees nothing" behavior, without relying on
-- expression evaluation order at all.

drop policy workspace_members_isolation on workspace_members;
create policy workspace_members_isolation on workspace_members
  using (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid);

drop policy audit_log_isolation on audit_log;
create policy audit_log_isolation on audit_log
  using (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid);

drop policy integration_credentials_isolation on integration_credentials;
create policy integration_credentials_isolation on integration_credentials
  using (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid);

drop policy notifications_isolation on notifications;
create policy notifications_isolation on notifications
  using (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid);
