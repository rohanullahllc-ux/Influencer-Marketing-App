import { desc, eq } from "drizzle-orm";
import { withWorkspace, writeAuditLog, schema } from "@rdv/db";
import { requireRole } from "@rdv/auth";
import { getQueue, QUEUE_LANES } from "@rdv/queue";
import { NotFoundError, ValidationError, oneOrThrow } from "@rdv/lib";
import type { CreatorRelationship, CreatorNote, CreatorTask, CreatorConversationSummary, OutreachSend, InboundMessage } from "./entities.js";

const { creators, creatorRelationships, creatorNotes, creatorTasks, creatorConversationSummaries, outreachSends, inboundMessages, workspaceMembers } =
  schema;

/**
 * Wave 4 (Creator CRM, product vision §"Creator CRM: lifecycle,
 * relationship status, history, notes, tasks, AI conversation summaries"):
 * the operational relationship layer over an existing creator.
 *
 * Deliberately does NOT duplicate outreach/reply history into a CRM-only
 * table — `getCreatorHistory` reads the real `outreach_sends`/
 * `inbound_messages` rows live (Wave 3), per the mission's "reuse existing
 * entities... rather than duplicating." Only genuinely new state lives
 * here: lifecycle status/next action, notes, tasks, and AI-generated
 * conversation summaries.
 *
 * The AI summary call itself lives in the worker processor
 * (apps/worker/src/processors/creatorConversationSummary.ts) — same
 * layering as every other AI-backed feature in this build: @rdv/domain
 * provides read/write primitives, the worker orchestrates the AI call
 * between them, keeping every domain-level test here fully deterministic.
 *
 * No automatic cross-platform creator-identity merging is built anywhere
 * in this module (or this codebase) — the product vision's "never
 * auto-merge creator identities" constraint is satisfied by not building
 * an auto-merge feature, not by an extra guard here.
 */

const VALID_RELATIONSHIP_STATUSES = [
  "new",
  "contacted",
  "in_conversation",
  "negotiating",
  "partnered",
  "declined",
  "unresponsive",
  "do_not_contact",
] as const;
export type CreatorRelationshipStatus = (typeof VALID_RELATIONSHIP_STATUSES)[number];

const VALID_TASK_STATUSES = ["open", "done", "cancelled"] as const;
export type CreatorTaskStatus = (typeof VALID_TASK_STATUSES)[number];

async function requireActorRole(
  tx: Parameters<Parameters<typeof withWorkspace>[1]>[0],
  actorUserId: string,
  minimum: "member_operator" | "admin" | "owner"
): Promise<void> {
  const [actorMembership] = await tx.select().from(workspaceMembers).where(eq(workspaceMembers.userId, actorUserId));
  requireRole(actorMembership?.role, minimum);
}

async function requireCreatorExists(tx: Parameters<Parameters<typeof withWorkspace>[1]>[0], creatorId: string): Promise<void> {
  const [creator] = await tx.select({ id: creators.id }).from(creators).where(eq(creators.id, creatorId)).limit(1);
  if (!creator) throw new NotFoundError(`No creator with id ${creatorId}`);
}

/** Every creator implicitly starts at relationship status 'new' — materialized lazily on first read rather than requiring every discovery/manual-add path to remember to create a row. */
export async function getCreatorRelationship(params: {
  workspaceId: string;
  actorUserId: string;
  creatorId: string;
}): Promise<CreatorRelationship> {
  const { workspaceId, actorUserId, creatorId } = params;
  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");
    await requireCreatorExists(tx, creatorId);

    const [existing] = await tx.select().from(creatorRelationships).where(eq(creatorRelationships.creatorId, creatorId)).limit(1);
    if (existing) return existing;

    await tx
      .insert(creatorRelationships)
      .values({ workspaceId, creatorId })
      .onConflictDoNothing({ target: [creatorRelationships.workspaceId, creatorRelationships.creatorId] });

    return oneOrThrow(
      await tx.select().from(creatorRelationships).where(eq(creatorRelationships.creatorId, creatorId)).limit(1),
      "select creator_relationship after lazy insert"
    );
  });
}

export async function updateCreatorRelationship(params: {
  workspaceId: string;
  actorUserId: string;
  creatorId: string;
  status?: CreatorRelationshipStatus;
  nextAction?: string | null;
  nextActionDueAt?: Date | null;
}): Promise<CreatorRelationship> {
  const { workspaceId, actorUserId, creatorId, status, nextAction, nextActionDueAt } = params;
  if (status !== undefined && !VALID_RELATIONSHIP_STATUSES.includes(status)) {
    throw new ValidationError(`Invalid relationship status "${status}"`);
  }

  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");
    await requireCreatorExists(tx, creatorId);

    await tx
      .insert(creatorRelationships)
      .values({
        workspaceId,
        creatorId,
        status: status ?? "new",
        nextAction: nextAction ?? null,
        nextActionDueAt: nextActionDueAt ?? null,
        updatedBy: actorUserId,
      })
      .onConflictDoUpdate({
        target: [creatorRelationships.workspaceId, creatorRelationships.creatorId],
        set: {
          ...(status !== undefined ? { status } : {}),
          ...(nextAction !== undefined ? { nextAction } : {}),
          ...(nextActionDueAt !== undefined ? { nextActionDueAt } : {}),
          updatedBy: actorUserId,
          updatedAt: new Date(),
        },
      });

    const row = oneOrThrow(
      await tx.select().from(creatorRelationships).where(eq(creatorRelationships.creatorId, creatorId)).limit(1),
      "select creator_relationship after upsert"
    );

    await writeAuditLog(tx, {
      workspaceId,
      actorUserId,
      action: "creator_relationship.updated",
      entityType: "creator_relationship",
      entityId: row.id,
      metadata: { creatorId, status, nextAction, nextActionDueAt },
    });

    return row;
  });
}

export async function addCreatorNote(params: { workspaceId: string; actorUserId: string; creatorId: string; body: string }): Promise<CreatorNote> {
  const { workspaceId, actorUserId, creatorId, body } = params;
  if (!body || !body.trim()) throw new ValidationError("Note body is required");

  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");
    await requireCreatorExists(tx, creatorId);

    const row = oneOrThrow(
      await tx
        .insert(creatorNotes)
        .values({ workspaceId, creatorId, authorUserId: actorUserId, body: body.trim() })
        .returning(),
      "insert creator_note"
    );

    await writeAuditLog(tx, {
      workspaceId,
      actorUserId,
      action: "creator_note.added",
      entityType: "creator_note",
      entityId: row.id,
      metadata: { creatorId },
    });

    return row;
  });
}

export async function listCreatorNotes(params: { workspaceId: string; actorUserId: string; creatorId: string }): Promise<CreatorNote[]> {
  const { workspaceId, actorUserId, creatorId } = params;
  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");
    return tx.select().from(creatorNotes).where(eq(creatorNotes.creatorId, creatorId)).orderBy(desc(creatorNotes.createdAt));
  });
}

export async function createCreatorTask(params: {
  workspaceId: string;
  actorUserId: string;
  creatorId: string;
  title: string;
  campaignId?: string | null;
  dueAt?: Date | null;
  assignedTo?: string | null;
}): Promise<CreatorTask> {
  const { workspaceId, actorUserId, creatorId, title, campaignId = null, dueAt = null, assignedTo = null } = params;
  if (!title || !title.trim()) throw new ValidationError("Task title is required");

  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");
    await requireCreatorExists(tx, creatorId);

    const row = oneOrThrow(
      await tx
        .insert(creatorTasks)
        .values({ workspaceId, creatorId, campaignId, title: title.trim(), dueAt, assignedTo, createdBy: actorUserId })
        .returning(),
      "insert creator_task"
    );

    await writeAuditLog(tx, {
      workspaceId,
      actorUserId,
      action: "creator_task.created",
      entityType: "creator_task",
      entityId: row.id,
      metadata: { creatorId, campaignId },
    });

    return row;
  });
}

export async function listCreatorTasks(params: { workspaceId: string; actorUserId: string; creatorId: string }): Promise<CreatorTask[]> {
  const { workspaceId, actorUserId, creatorId } = params;
  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");
    return tx.select().from(creatorTasks).where(eq(creatorTasks.creatorId, creatorId)).orderBy(desc(creatorTasks.createdAt));
  });
}

export async function updateCreatorTaskStatus(params: {
  workspaceId: string;
  actorUserId: string;
  taskId: string;
  status: CreatorTaskStatus;
}): Promise<CreatorTask> {
  const { workspaceId, actorUserId, taskId, status } = params;
  if (!VALID_TASK_STATUSES.includes(status)) throw new ValidationError(`Invalid task status "${status}"`);

  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");

    const [existing] = await tx.select().from(creatorTasks).where(eq(creatorTasks.id, taskId)).limit(1);
    if (!existing) throw new NotFoundError(`No creator task with id ${taskId}`);

    await tx
      .update(creatorTasks)
      .set({ status, completedAt: status === "done" ? new Date() : existing.completedAt })
      .where(eq(creatorTasks.id, taskId));

    const row = oneOrThrow(
      await tx.select().from(creatorTasks).where(eq(creatorTasks.id, taskId)).limit(1),
      "select creator_task after status update"
    );

    await writeAuditLog(tx, {
      workspaceId,
      actorUserId,
      action: "creator_task.status_changed",
      entityType: "creator_task",
      entityId: taskId,
      metadata: { status },
    });

    return row;
  });
}

export interface CreatorHistory {
  outreachSends: OutreachSend[];
  inboundMessages: InboundMessage[];
}

/** Real outreach/reply history, read live from the existing Wave 3 tables — never duplicated into a CRM-only copy. */
export async function getCreatorHistory(params: { workspaceId: string; actorUserId: string; creatorId: string }): Promise<CreatorHistory> {
  const { workspaceId, actorUserId, creatorId } = params;
  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");
    const sends = await tx.select().from(outreachSends).where(eq(outreachSends.creatorId, creatorId)).orderBy(desc(outreachSends.createdAt));
    const messages = await tx
      .select()
      .from(inboundMessages)
      .where(eq(inboundMessages.creatorId, creatorId))
      .orderBy(desc(inboundMessages.receivedAt));
    return { outreachSends: sends, inboundMessages: messages };
  });
}

export async function requestCreatorConversationSummary(params: {
  workspaceId: string;
  actorUserId: string;
  creatorId: string;
  campaignId?: string | null;
}): Promise<{ jobId: string }> {
  const { workspaceId, actorUserId, creatorId, campaignId = null } = params;

  await withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");
    await requireCreatorExists(tx, creatorId);
  });

  const job = await getQueue(QUEUE_LANES.aiOps).add("summarize_creator_conversation", { workspaceId, actorUserId, creatorId, campaignId });
  if (!job.id) throw new Error("summarize_creator_conversation job was enqueued without an id");
  return { jobId: job.id };
}

/** Called only by the worker's `summarize_creator_conversation` job processor, after it has already called the AI operation itself. */
export async function persistCreatorConversationSummary(params: {
  workspaceId: string;
  actorUserId: string;
  creatorId: string;
  campaignId?: string | null;
  summary: string;
  keyPoints: string[];
  basedOnMessageCount: number;
}): Promise<CreatorConversationSummary> {
  const { workspaceId, actorUserId, creatorId, campaignId = null, summary, keyPoints, basedOnMessageCount } = params;

  return withWorkspace(workspaceId, async (tx) => {
    const row = oneOrThrow(
      await tx
        .insert(creatorConversationSummaries)
        .values({ workspaceId, creatorId, campaignId, summary, keyPoints, basedOnMessageCount, generatedBy: actorUserId })
        .returning(),
      "insert creator_conversation_summary"
    );

    await writeAuditLog(tx, {
      workspaceId,
      actorUserId,
      action: "creator_conversation_summary.generated",
      entityType: "creator_conversation_summary",
      entityId: row.id,
      metadata: { creatorId, basedOnMessageCount },
    });

    return row;
  });
}

export async function listCreatorConversationSummaries(params: {
  workspaceId: string;
  actorUserId: string;
  creatorId: string;
}): Promise<CreatorConversationSummary[]> {
  const { workspaceId, actorUserId, creatorId } = params;
  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");
    return tx
      .select()
      .from(creatorConversationSummaries)
      .where(eq(creatorConversationSummaries.creatorId, creatorId))
      .orderBy(desc(creatorConversationSummaries.generatedAt));
  });
}

export async function getCreatorConversationSummaryRunStatus(params: {
  workspaceId: string;
  actorUserId: string;
  runId: string;
}): Promise<{ id: string; state: string; summaryId: string | null; failedReason: string | null }> {
  const { workspaceId, actorUserId, runId } = params;

  await withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");
  });

  const job = await getQueue(QUEUE_LANES.aiOps).getJob(runId);
  if (!job) throw new NotFoundError(`No summary run with id ${runId}`);

  const state = await job.getState();
  if (state === "completed") {
    const returnValue = job.returnvalue as { summaryId: string } | undefined;
    return { id: job.id!, state, summaryId: returnValue?.summaryId ?? null, failedReason: null };
  }
  if (state === "failed") {
    return { id: job.id!, state, summaryId: null, failedReason: job.failedReason ?? "Unknown error" };
  }
  return { id: job.id!, state, summaryId: null, failedReason: null };
}
