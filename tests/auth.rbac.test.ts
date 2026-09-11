import { describe, it, expect, beforeEach } from "vitest";
import { createWorkspaceWithOwner, addMember, getMembership, listWorkspacesForUser, getUserByEmail } from "@rdv/auth";
import { withWorkspace, schema } from "@rdv/db";
import { AuthorizationError } from "@rdv/lib";
import { resetDb } from "./helpers.js";

describe("RBAC enforcement", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("owner can add a member_operator and an admin", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "RBAC WS", ownerEmail: "owner@test.local" });
    const owner = await getUserByEmail("owner@test.local");

    await addMember({ workspaceId: ws.id, actorUserId: owner.id, targetEmail: "op@test.local", role: "member_operator" });
    await addMember({ workspaceId: ws.id, actorUserId: owner.id, targetEmail: "admin@test.local", role: "admin" });

    const op = await getUserByEmail("op@test.local");
    const admin = await getUserByEmail("admin@test.local");
    expect((await getMembership(ws.id, op.id))?.role).toBe("member_operator");
    expect((await getMembership(ws.id, admin.id))?.role).toBe("admin");
  });

  it("a member_operator cannot add another member (insufficient role)", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "RBAC WS 2", ownerEmail: "owner2@test.local" });
    const owner = await getUserByEmail("owner2@test.local");
    await addMember({ workspaceId: ws.id, actorUserId: owner.id, targetEmail: "op2@test.local", role: "member_operator" });
    const op = await getUserByEmail("op2@test.local");

    await expect(
      addMember({ workspaceId: ws.id, actorUserId: op.id, targetEmail: "intruder@test.local", role: "member_operator" })
    ).rejects.toThrow(AuthorizationError);
  });

  it("an admin cannot promote someone to owner (only an owner can)", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "RBAC WS 3", ownerEmail: "owner3@test.local" });
    const owner = await getUserByEmail("owner3@test.local");
    await addMember({ workspaceId: ws.id, actorUserId: owner.id, targetEmail: "admin3@test.local", role: "admin" });
    const admin = await getUserByEmail("admin3@test.local");

    await expect(
      addMember({ workspaceId: ws.id, actorUserId: admin.id, targetEmail: "newowner@test.local", role: "owner" })
    ).rejects.toThrow(AuthorizationError);
  });

  it("a user with no membership in the workspace is rejected, not silently ignored", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "RBAC WS 4", ownerEmail: "owner4@test.local" });
    const outsider = await createWorkspaceWithOwner({ workspaceName: "Other WS", ownerEmail: "outsider@test.local" });
    const outsiderUser = await getUserByEmail("outsider@test.local");

    await expect(
      addMember({ workspaceId: ws.id, actorUserId: outsiderUser.id, targetEmail: "x@test.local", role: "member_operator" })
    ).rejects.toThrow(AuthorizationError);
    expect(outsider.id).not.toBe(ws.id); // sanity: distinct workspaces
  });

  it("listWorkspacesForUser returns every workspace a user belongs to, with role", async () => {
    const wsA = await createWorkspaceWithOwner({ workspaceName: "Multi A", ownerEmail: "multi@test.local" });
    const wsB = await createWorkspaceWithOwner({ workspaceName: "Multi B", ownerEmail: "other-owner@test.local" });
    const multiUser = await getUserByEmail("multi@test.local");
    const otherOwner = await getUserByEmail("other-owner@test.local");
    await addMember({ workspaceId: wsB.id, actorUserId: otherOwner.id, targetEmail: "multi@test.local", role: "admin" });

    const workspaces = await listWorkspacesForUser(multiUser.id);
    expect(workspaces).toHaveLength(2);
    const roles = Object.fromEntries(workspaces.map((w) => [w.id, w.role]));
    expect(roles[wsA.id]).toBe("owner");
    expect(roles[wsB.id]).toBe("admin");
  });

  it("every membership change is recorded in the audit log exactly once, and a no-op re-add writes nothing new", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "Audit WS", ownerEmail: "audit-owner@test.local" });
    const owner = await getUserByEmail("audit-owner@test.local");
    await addMember({ workspaceId: ws.id, actorUserId: owner.id, targetEmail: "audited@test.local", role: "member_operator" });
    // Re-add with the exact same role: should be a no-op, no duplicate audit row.
    await addMember({ workspaceId: ws.id, actorUserId: owner.id, targetEmail: "audited@test.local", role: "member_operator" });

    const auditRows = await withWorkspace(ws.id, (tx) => tx.select().from(schema.auditLog));
    const memberAddedRows = auditRows.filter((r) => r.action === "workspace.member_added");
    expect(memberAddedRows).toHaveLength(1);

    // Now actually change the role: should produce exactly one more row.
    await addMember({ workspaceId: ws.id, actorUserId: owner.id, targetEmail: "audited@test.local", role: "admin" });
    const auditRowsAfterChange = await withWorkspace(ws.id, (tx) => tx.select().from(schema.auditLog));
    const roleChangedRows = auditRowsAfterChange.filter((r) => r.action === "workspace.member_role_changed");
    expect(roleChangedRows).toHaveLength(1);
  });
});
