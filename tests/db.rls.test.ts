import { describe, it, expect, beforeEach } from "vitest";
import { withWorkspace, schema } from "@rdv/db";
import { createWorkspaceWithOwner } from "@rdv/auth";
import { resetDb } from "./helpers.js";

/**
 * Wave 1 acceptance criterion (Step 5 §5.1): cross-workspace RLS
 * isolation. A query scoped to workspace A must never return rows that
 * belong to workspace B, even though both are queried through the exact
 * same application DB role and the exact same SQL — the only thing
 * different is which `app.current_workspace_id` is set.
 */
describe("RLS cross-workspace isolation", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("scopes workspace_members to the current workspace only", async () => {
    const wsA = await createWorkspaceWithOwner({ workspaceName: "Workspace A", ownerEmail: "a-owner@test.local" });
    const wsB = await createWorkspaceWithOwner({ workspaceName: "Workspace B", ownerEmail: "b-owner@test.local" });

    const membersVisibleFromA = await withWorkspace(wsA.id, (tx) => tx.select().from(schema.workspaceMembers));
    const membersVisibleFromB = await withWorkspace(wsB.id, (tx) => tx.select().from(schema.workspaceMembers));

    expect(membersVisibleFromA).toHaveLength(1);
    expect(membersVisibleFromA[0]?.workspaceId).toBe(wsA.id);
    expect(membersVisibleFromB).toHaveLength(1);
    expect(membersVisibleFromB[0]?.workspaceId).toBe(wsB.id);
  });

  it("scopes audit_log to the current workspace only", async () => {
    const wsA = await createWorkspaceWithOwner({ workspaceName: "Workspace A", ownerEmail: "a-owner2@test.local" });
    await createWorkspaceWithOwner({ workspaceName: "Workspace B", ownerEmail: "b-owner2@test.local" });

    const auditFromA = await withWorkspace(wsA.id, (tx) => tx.select().from(schema.auditLog));

    expect(auditFromA).toHaveLength(1);
    expect(auditFromA.every((row) => row.workspaceId === wsA.id)).toBe(true);
  });

  it("returns zero rows (not an error) when a workspace has no data yet", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "Empty-ish WS", ownerEmail: "empty-owner@test.local" });
    const notifications = await withWorkspace(ws.id, (tx) => tx.select().from(schema.notifications));
    expect(notifications).toHaveLength(0);
  });

  it("a bare, unscoped query (no app.current_workspace_id set) sees no tenant rows via the RLS-enforced client", async () => {
    await createWorkspaceWithOwner({ workspaceName: "Workspace C", ownerEmail: "c-owner@test.local" });
    // Deliberately query through `db` directly, bypassing withWorkspace,
    // to prove the RLS policy — not application code discipline — is what
    // enforces isolation. current_setting(..., true) returns null when
    // unset, and `workspace_id = null` is never true.
    const { db } = await import("@rdv/db");
    const rows = await db.select().from(schema.workspaceMembers);
    expect(rows).toHaveLength(0);
  });
});
