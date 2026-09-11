import { describe, it, expect, beforeEach } from "vitest";
import { dispatchNotification, listUnread, markRead } from "@rdv/notifications";
import { createWorkspaceWithOwner, getUserByEmail } from "@rdv/auth";
import { resetDb } from "./helpers.js";

describe("Notification dispatch (Foundation)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("dispatches an in-app notification and it shows up as unread", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "Notif WS", ownerEmail: "notif-owner@test.local" });
    const owner = await getUserByEmail("notif-owner@test.local");

    await dispatchNotification({
      workspaceId: ws.id,
      userId: owner.id,
      type: "stub_test",
      channel: "in_app",
      payload: { note: "hello" },
    });

    const unread = await listUnread(ws.id, owner.id);
    expect(unread).toHaveLength(1);
    expect(unread[0]?.type).toBe("stub_test");
    expect(unread[0]?.payload).toEqual({ note: "hello" });
  });

  it("markRead removes a notification from the unread list", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "Notif WS 2", ownerEmail: "notif-owner2@test.local" });
    const owner = await getUserByEmail("notif-owner2@test.local");
    const id = await dispatchNotification({ workspaceId: ws.id, userId: owner.id, type: "stub_test", channel: "in_app" });

    await markRead(ws.id, id);
    const unread = await listUnread(ws.id, owner.id);
    expect(unread).toHaveLength(0);
  });

  it("notifications are workspace-isolated under RLS", async () => {
    const wsA = await createWorkspaceWithOwner({ workspaceName: "Notif A", ownerEmail: "notif-a@test.local" });
    const wsB = await createWorkspaceWithOwner({ workspaceName: "Notif B", ownerEmail: "notif-b@test.local" });
    const ownerA = await getUserByEmail("notif-a@test.local");
    const ownerB = await getUserByEmail("notif-b@test.local");

    await dispatchNotification({ workspaceId: wsA.id, userId: ownerA.id, type: "stub_test", channel: "in_app" });

    const unreadForBInWorkspaceA = await listUnread(wsA.id, ownerB.id);
    expect(unreadForBInWorkspaceA).toHaveLength(0);
  });
});
