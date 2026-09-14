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
      dry_run_evaluation_results,
      dry_run_evaluations,
      suppressions,
      approvals,
      outreach_drafts,
      creator_matches,
      creator_qualifications,
      campaign_templates,
      outreach_templates,
      campaign_creators,
      campaigns,
      creators,
      product_intelligence,
      products,
      workspace_members,
      workspaces,
      users
    restart identity cascade
  `;
}
