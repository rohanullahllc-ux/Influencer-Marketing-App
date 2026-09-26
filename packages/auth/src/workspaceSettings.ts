import { eq } from "drizzle-orm";
import { withWorkspace, writeAuditLog, schema } from "@rdv/db";
import { requireRole } from "./rbac.js";

/**
 * Whether this workspace has Mock AI mode enabled (Settings > Integrations).
 * When true, `packages/ai`'s operations return clearly-labeled placeholder
 * output instead of calling the real DeepSeek API — lets a workspace
 * exercise the full AI-assisted workflow (product intelligence, matching,
 * outreach drafts, reply classification) with no key and no API cost.
 * Read by every operation in `packages/ai/src/operations/*.ts` before it
 * would otherwise attempt a real API call. This is an explicit, human-set
 * toggle only — never implied by the mere absence of a credential (a
 * missing key still throws exactly as before unless this is turned on).
 *
 * `workspaces` itself carries no RLS (see packages/db's own migration
 * comment — it is the root table, not a workspace-scoped child), so this
 * reads it directly with an explicit id filter rather than relying on
 * `app.current_workspace_id`.
 */
export async function isAiMockModeEnabled(workspaceId: string): Promise<boolean> {
  return withWorkspace(workspaceId, async (tx) => {
    const [row] = await tx
      .select({ aiMockMode: schema.workspaces.aiMockMode })
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, workspaceId))
      .limit(1);
    return row?.aiMockMode ?? false;
  });
}

/** Owner/Admin-only, mirroring `storeCredential`'s access check exactly. */
export async function setAiMockMode(params: {
  workspaceId: string;
  actorUserId: string;
  enabled: boolean;
}): Promise<void> {
  const { workspaceId, actorUserId, enabled } = params;

  await withWorkspace(workspaceId, async (tx) => {
    const [actorMembership] = await tx
      .select()
      .from(schema.workspaceMembers)
      .where(eq(schema.workspaceMembers.userId, actorUserId));
    requireRole(actorMembership?.role, "admin");

    await tx.update(schema.workspaces).set({ aiMockMode: enabled }).where(eq(schema.workspaces.id, workspaceId));

    await writeAuditLog(tx, {
      workspaceId,
      actorUserId,
      action: enabled ? "ai_mock_mode.enabled" : "ai_mock_mode.disabled",
      entityType: "workspace",
      entityId: workspaceId,
      metadata: {},
    });
  });
}
