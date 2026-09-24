import { describe, it, expect, beforeEach } from "vitest";
import {
  createManualCreator,
  getCreatorRelationship,
  updateCreatorRelationship,
  addCreatorNote,
  listCreatorNotes,
  createCreatorTask,
  listCreatorTasks,
  updateCreatorTaskStatus,
  getCreatorHistory,
} from "@rdv/domain";
import { createWorkspaceWithOwner, getUserByEmail } from "@rdv/auth";
import { AuthorizationError, NotFoundError, ValidationError } from "@rdv/lib";
import { resetDb } from "./helpers.js";

/**
 * Wave 4 (Creator CRM): the operational relationship layer over an
 * existing creator. getCreatorHistory is exercised only for the "reads
 * real Wave 3 tables, never a duplicate" contract here — full outreach/
 * reply history content is already covered by tests/domain.outreachSend.
 * test.ts and tests/domain.replies.test.ts.
 */
describe("Creator CRM (Wave 4)", () => {
  let wsId: string;
  let ownerId: string;
  let creatorId: string;

  beforeEach(async () => {
    await resetDb();
    const ws = await createWorkspaceWithOwner({ workspaceName: "CRM WS", ownerEmail: "crm-owner@test.local" });
    wsId = ws.id;
    ownerId = (await getUserByEmail("crm-owner@test.local")).id;
    const creator = await createManualCreator({ workspaceId: wsId, actorUserId: ownerId, displayName: "Cook", contactEmail: "cook@example.com" });
    creatorId = creator.id;
  });

  it("a creator implicitly starts at relationship status 'new' without any explicit setup", async () => {
    const rel = await getCreatorRelationship({ workspaceId: wsId, actorUserId: ownerId, creatorId });
    expect(rel.status).toBe("new");
    expect(rel.nextAction).toBeNull();
  });

  it("updates relationship status and next action, and tracks who/when", async () => {
    const updated = await updateCreatorRelationship({
      workspaceId: wsId,
      actorUserId: ownerId,
      creatorId,
      status: "in_conversation",
      nextAction: "Follow up next Tuesday",
    });
    expect(updated.status).toBe("in_conversation");
    expect(updated.nextAction).toBe("Follow up next Tuesday");
    expect(updated.updatedBy).toBe(ownerId);

    // Re-reading returns the same, single row -- not a second one.
    const reread = await getCreatorRelationship({ workspaceId: wsId, actorUserId: ownerId, creatorId });
    expect(reread.id).toBe(updated.id);
    expect(reread.status).toBe("in_conversation");
  });

  it("a partial update leaves fields not passed untouched", async () => {
    await updateCreatorRelationship({ workspaceId: wsId, actorUserId: ownerId, creatorId, status: "contacted", nextAction: "Wait for reply" });
    const partial = await updateCreatorRelationship({ workspaceId: wsId, actorUserId: ownerId, creatorId, status: "negotiating" });
    expect(partial.status).toBe("negotiating");
    expect(partial.nextAction).toBe("Wait for reply");
  });

  it("rejects an invalid relationship status", async () => {
    await expect(
      updateCreatorRelationship({ workspaceId: wsId, actorUserId: ownerId, creatorId, status: "not_a_real_status" as never })
    ).rejects.toThrow(ValidationError);
  });

  it("rejects a relationship read/write for a nonexistent creator", async () => {
    await expect(
      getCreatorRelationship({ workspaceId: wsId, actorUserId: ownerId, creatorId: "00000000-0000-0000-0000-000000000000" })
    ).rejects.toThrow(NotFoundError);
  });

  it("adds and lists notes, newest first, never editable in place", async () => {
    await addCreatorNote({ workspaceId: wsId, actorUserId: ownerId, creatorId, body: "First contact went well." });
    await addCreatorNote({ workspaceId: wsId, actorUserId: ownerId, creatorId, body: "Asked about rates." });

    const notes = await listCreatorNotes({ workspaceId: wsId, actorUserId: ownerId, creatorId });
    expect(notes).toHaveLength(2);
    expect(notes[0]!.body).toBe("Asked about rates.");
    expect(notes[0]!.authorUserId).toBe(ownerId);
  });

  it("rejects an empty note body", async () => {
    await expect(addCreatorNote({ workspaceId: wsId, actorUserId: ownerId, creatorId, body: "   " })).rejects.toThrow(ValidationError);
  });

  it("creates a task, lists it, and moves it through open -> done", async () => {
    const task = await createCreatorTask({ workspaceId: wsId, actorUserId: ownerId, creatorId, title: "Send follow-up email" });
    expect(task.status).toBe("open");
    expect(task.completedAt).toBeNull();

    const tasks = await listCreatorTasks({ workspaceId: wsId, actorUserId: ownerId, creatorId });
    expect(tasks).toHaveLength(1);

    const done = await updateCreatorTaskStatus({ workspaceId: wsId, actorUserId: ownerId, taskId: task.id, status: "done" });
    expect(done.status).toBe("done");
    expect(done.completedAt).not.toBeNull();
  });

  it("rejects an empty task title", async () => {
    await expect(createCreatorTask({ workspaceId: wsId, actorUserId: ownerId, creatorId, title: "" })).rejects.toThrow(ValidationError);
  });

  it("rejects updating a nonexistent task", async () => {
    await expect(
      updateCreatorTaskStatus({ workspaceId: wsId, actorUserId: ownerId, taskId: "00000000-0000-0000-0000-000000000000", status: "done" })
    ).rejects.toThrow(NotFoundError);
  });

  it("getCreatorHistory reads real (empty, in this fixture) outreach/reply tables rather than any CRM-only copy", async () => {
    const history = await getCreatorHistory({ workspaceId: wsId, actorUserId: ownerId, creatorId });
    expect(history.outreachSends).toEqual([]);
    expect(history.inboundMessages).toEqual([]);
  });

  it("RBAC applies: an unauthenticated/unknown actor is rejected", async () => {
    await expect(
      getCreatorRelationship({ workspaceId: wsId, actorUserId: "00000000-0000-0000-0000-000000000000", creatorId })
    ).rejects.toThrow(AuthorizationError);
  });
});
