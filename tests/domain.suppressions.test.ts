import { describe, it, expect, beforeEach } from "vitest";
import { addSuppression, listSuppressions, isSuppressed, normalizeIdentity } from "@rdv/domain";
import { createWorkspaceWithOwner, getUserByEmail } from "@rdv/auth";
import { resetDb } from "./helpers.js";

/** Wave 2 Phase 7 (plan §12, §14.7): durable, workspace-scoped suppression/DNC handling. */
describe("Suppressions", () => {
  let wsId: string;
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    const ws = await createWorkspaceWithOwner({ workspaceName: "Suppression WS", ownerEmail: "suppression-owner@test.local" });
    wsId = ws.id;
    ownerId = (await getUserByEmail("suppression-owner@test.local")).id;
  });

  it("normalizes identity to lowercase/trimmed", () => {
    expect(normalizeIdentity("  Jane@Example.com  ")).toBe("jane@example.com");
  });

  it("rejects an empty identity", async () => {
    await expect(addSuppression({ workspaceId: wsId, actorUserId: ownerId, identity: "  " })).rejects.toThrow(/identity is required/);
  });

  it("adds and lists a suppression, workspace-scoped", async () => {
    await addSuppression({ workspaceId: wsId, actorUserId: ownerId, identity: "Jane@Example.com", reason: "unsubscribed" });

    const otherWs = await createWorkspaceWithOwner({ workspaceName: "Other Suppression WS", ownerEmail: "suppression-other@test.local" });
    const otherOwnerId = (await getUserByEmail("suppression-other@test.local")).id;
    await addSuppression({ workspaceId: otherWs.id, actorUserId: otherOwnerId, identity: "someone-else@example.com" });

    const list = await listSuppressions({ workspaceId: wsId, actorUserId: ownerId });
    expect(list).toHaveLength(1);
    expect(list[0]?.normalizedIdentity).toBe("jane@example.com");
    expect(list[0]?.reason).toBe("unsubscribed");
  });

  it("isSuppressed matches regardless of case/whitespace, and is false for a null identity or unknown address", async () => {
    await addSuppression({ workspaceId: wsId, actorUserId: ownerId, identity: "jane@example.com" });

    expect(await isSuppressed({ workspaceId: wsId, identity: "  JANE@EXAMPLE.COM  " })).toBe(true);
    expect(await isSuppressed({ workspaceId: wsId, identity: "someone-else@example.com" })).toBe(false);
    expect(await isSuppressed({ workspaceId: wsId, identity: null })).toBe(false);
  });
});
