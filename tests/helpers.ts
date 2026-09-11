import { systemQueryClient } from "@rdv/db/systemClient";

/**
 * Truncates every app data table in the test database (but leaves
 * schema_migrations alone — that tracks DDL, not test fixtures). Call in
 * beforeEach so tests are independent of each other and of run order.
 */
export async function resetDb(): Promise<void> {
  await systemQueryClient`
    truncate table
      audit_log,
      notifications,
      integration_credentials,
      workspace_members,
      workspaces,
      users
    restart identity cascade
  `;
}
