import { and, eq } from "drizzle-orm";
import { withWorkspace, writeAuditLog, schema } from "@rdv/db";
import { requireRole } from "@rdv/auth";
import { getQueue, QUEUE_LANES } from "@rdv/queue";
import { NotFoundError, ValidationError, oneOrThrow } from "@rdv/lib";
import type { OutreachDraft } from "./entities.js";
import { computeContentHash, invalidateApprovalsForDraft } from "./approvals.js";

const { campaigns, campaignCreators, campaignTemplates, outreachTemplates, outreachDrafts, workspaceMembers } = schema;

/**
 * Wave 2 Phase 6 (plan §11): AI-drafted, personalized outreach — always
 * generated async (plan §11's own worker note) and always editable
 * afterward. Editing a draft that already has an approval invalidates
 * that approval (see approvals.ts's invalidateApprovalsForDraft) — this
 * module owns draft content, approvals.ts owns the content-pinned
 * approval record; the two only meet at that one invalidation call.
 */

async function requireActorRole(
  tx: Parameters<Parameters<typeof withWorkspace>[1]>[0],
  actorUserId: string,
  minimum: "member_operator" | "admin" | "owner"
): Promise<void> {
  const [actorMembership] = await tx.select().from(workspaceMembers).where(eq(workspaceMembers.userId, actorUserId));
  requireRole(actorMembership?.role, minimum);
}

export async function requestOutreachDraftGeneration(params: {
  workspaceId: string;
  actorUserId: string;
  campaignId: string;
  creatorId: string;
  templateId?: string;
}): Promise<{ jobId: string }> {
  const { workspaceId, actorUserId, campaignId, creatorId, templateId } = params;

  await withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");

    const [campaign] = await tx.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
    if (!campaign) throw new NotFoundError(`No campaign with id ${campaignId}`);

    const [shortlisted] = await tx
      .select()
      .from(campaignCreators)
      .where(and(eq(campaignCreators.campaignId, campaignId), eq(campaignCreators.creatorId, creatorId)))
      .limit(1);
    if (!shortlisted) throw new ValidationError("This creator is not shortlisted on this campaign");

    if (templateId) {
      const [template] = await tx.select().from(outreachTemplates).where(eq(outreachTemplates.id, templateId)).limit(1);
      if (!template) throw new NotFoundError(`No template with id ${templateId}`);
    }
  });

  const job = await getQueue(QUEUE_LANES.aiOps).add("ai_personalize_outreach", {
    workspaceId,
    actorUserId,
    campaignId,
    creatorId,
    templateId: templateId ?? null,
  });
  if (!job.id) throw new Error("ai_personalize_outreach job was enqueued without an id");
  return { jobId: job.id };
}

/**
 * Resolves which template (if any) a draft should personalize, given no
 * explicit templateId: the "default" segment's assignment if one exists,
 * else the campaign's sole assignment if there is exactly one, else none
 * (the AI operation writes an outreach email from scratch — plan §11
 * doesn't require a template, only "an assigned template" when one
 * applies). Called only by the worker.
 */
export async function resolveTemplateForCampaign(params: {
  workspaceId: string;
  campaignId: string;
  explicitTemplateId: string | null;
}): Promise<{ id: string; subject: string | null; body: string | null } | null> {
  const { workspaceId, campaignId, explicitTemplateId } = params;

  return withWorkspace(workspaceId, async (tx) => {
    if (explicitTemplateId) {
      const [template] = await tx.select().from(outreachTemplates).where(eq(outreachTemplates.id, explicitTemplateId)).limit(1);
      return template ? { id: template.id, subject: template.subject, body: template.body } : null;
    }

    const assignments = await tx.select().from(campaignTemplates).where(eq(campaignTemplates.campaignId, campaignId));
    if (assignments.length === 0) return null;

    const defaultAssignment = assignments.find((a) => a.assignmentSegment === "default") ?? (assignments.length === 1 ? assignments[0] : undefined);
    if (!defaultAssignment) return null;

    const [template] = await tx.select().from(outreachTemplates).where(eq(outreachTemplates.id, defaultAssignment.templateId)).limit(1);
    return template ? { id: template.id, subject: template.subject, body: template.body } : null;
  });
}

/** Called only by the worker's `ai_personalize_outreach` job processor — always inserts a fresh draft. */
export async function persistOutreachDraft(params: {
  workspaceId: string;
  campaignId: string;
  creatorId: string;
  templateId: string | null;
  subject: string;
  body: string;
  generationInput: Record<string, unknown>;
}): Promise<OutreachDraft> {
  const { workspaceId, campaignId, creatorId, templateId, subject, body, generationInput } = params;

  return withWorkspace(workspaceId, async (tx) => {
    const row = oneOrThrow(
      await tx
        .insert(outreachDrafts)
        .values({
          workspaceId,
          campaignId,
          creatorId,
          templateId,
          subject,
          body,
          generationInput,
          provenance: "ai_derived",
          status: "draft",
        })
        .returning(),
      "insert outreach draft"
    );

    await writeAuditLog(tx, {
      workspaceId,
      actorUserId: null,
      action: "outreach_draft.generated",
      entityType: "outreach_draft",
      entityId: row.id,
      metadata: { campaignId, creatorId },
    });

    return row;
  });
}

/**
 * Poll backing for the async generation job (plan §11 names only
 * `POST /api/outreach-drafts` + `GET /api/outreach-drafts/:id`; polling
 * by run id is the same necessary mechanism Phase 3/5 already established
 * for their own async jobs, applied here so the client can learn when
 * the generated draft's id becomes available).
 */
export async function getOutreachDraftRunStatus(params: {
  workspaceId: string;
  actorUserId: string;
  runId: string;
}): Promise<{ id: string; state: string; draftId: string | null; failedReason: string | null }> {
  const { workspaceId, actorUserId, runId } = params;

  await withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");
  });

  const job = await getQueue(QUEUE_LANES.aiOps).getJob(runId);
  if (!job) throw new NotFoundError(`No draft-generation run with id ${runId}`);

  const state = await job.getState();

  if (state === "completed") {
    const returnValue = job.returnvalue as { draftId: string } | undefined;
    return { id: job.id!, state, draftId: returnValue?.draftId ?? null, failedReason: null };
  }
  if (state === "failed") {
    return { id: job.id!, state, draftId: null, failedReason: job.failedReason ?? "Unknown error" };
  }
  return { id: job.id!, state, draftId: null, failedReason: null };
}

export async function getOutreachDraft(params: {
  workspaceId: string;
  actorUserId: string;
  draftId: string;
}): Promise<OutreachDraft> {
  const { workspaceId, actorUserId, draftId } = params;
  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");
    const [draft] = await tx.select().from(outreachDrafts).where(eq(outreachDrafts.id, draftId)).limit(1);
    if (!draft) throw new NotFoundError(`No outreach draft with id ${draftId}`);
    return draft;
  });
}

/**
 * Human edit of a draft's content (plan §11 acceptance criterion: "a
 * subsequent edit to the source draft demonstrably invalidates that
 * approval"). Not named as its own API route in plan §11's route list,
 * but required by that same acceptance criterion — there is no other way
 * to satisfy it. Always allowed regardless of the draft's current
 * status: the draft itself stays editable; what changes is that any
 * approval whose pinned content no longer matches is invalidated.
 */
export async function editOutreachDraft(params: {
  workspaceId: string;
  actorUserId: string;
  draftId: string;
  subject?: string;
  body?: string;
}): Promise<OutreachDraft> {
  const { workspaceId, actorUserId, draftId, subject, body } = params;
  if (subject === undefined && body === undefined) {
    throw new ValidationError("subject and/or body is required to edit a draft");
  }
  if (subject !== undefined && subject.trim().length === 0) {
    throw new ValidationError("subject must not be empty");
  }
  if (body !== undefined && body.trim().length === 0) {
    throw new ValidationError("body must not be empty");
  }

  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");

    const [existing] = await tx.select().from(outreachDrafts).where(eq(outreachDrafts.id, draftId)).limit(1);
    if (!existing) throw new NotFoundError(`No outreach draft with id ${draftId}`);

    const newSubject = subject ?? existing.subject;
    const newBody = body ?? existing.body;

    const updated = oneOrThrow(
      await tx
        .update(outreachDrafts)
        .set({ subject: newSubject, body: newBody, status: "edited" })
        .where(eq(outreachDrafts.id, draftId))
        .returning(),
      "update outreach draft"
    );

    const newHash = computeContentHash(newSubject, newBody);
    const invalidatedCount = await invalidateApprovalsForDraft(tx, { workspaceId, draftId, currentContentHash: newHash });

    await writeAuditLog(tx, {
      workspaceId,
      actorUserId,
      action: "outreach_draft.edited",
      entityType: "outreach_draft",
      entityId: updated.id,
      metadata: { invalidatedApprovals: invalidatedCount },
    });

    return updated;
  });
}
