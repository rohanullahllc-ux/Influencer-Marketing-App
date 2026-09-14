import { and, eq, desc } from "drizzle-orm";
import { withWorkspace, writeAuditLog, schema } from "@rdv/db";
import { requireRole } from "@rdv/auth";
import { NotFoundError, ValidationError, oneOrThrow } from "@rdv/lib";
import type { OutreachTemplate, CampaignTemplate } from "./entities.js";

const { outreachTemplates, campaignTemplates, campaigns, workspaceMembers } = schema;

/**
 * Wave 2 Phase 4 (plan §9): Outreach Template CRUD + simple segment-based
 * campaign↔template assignment — one template per (campaign, segment),
 * enforced by the Phase 1 unique index. Explicitly NOT A/B testing
 * infrastructure (plan §9 constraint): a "segment" is a plain string the
 * caller supplies (e.g. a creator tier/type), not a traffic-split system.
 */

const TEMPLATE_STATUSES = ["draft", "active", "archived"] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

async function requireActorRole(
  tx: Parameters<Parameters<typeof withWorkspace>[1]>[0],
  actorUserId: string,
  minimum: "member_operator" | "admin" | "owner"
): Promise<void> {
  const [actorMembership] = await tx.select().from(workspaceMembers).where(eq(workspaceMembers.userId, actorUserId));
  requireRole(actorMembership?.role, minimum);
}

export async function createTemplate(params: {
  workspaceId: string;
  actorUserId: string;
  name: string;
  subject?: string | null;
  body?: string | null;
  variables?: string[] | null;
}): Promise<OutreachTemplate> {
  const { workspaceId, actorUserId, name, subject, body, variables } = params;
  if (!name || name.trim().length === 0) {
    throw new ValidationError("name is required to create a template");
  }

  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");

    const template = oneOrThrow(
      await tx
        .insert(outreachTemplates)
        .values({
          workspaceId,
          name: name.trim(),
          subject: subject ?? null,
          body: body ?? null,
          variables: variables ?? null,
          createdBy: actorUserId,
        })
        .returning(),
      "insert template"
    );

    await writeAuditLog(tx, {
      workspaceId,
      actorUserId,
      action: "template.created",
      entityType: "outreach_template",
      entityId: template.id,
      metadata: { name: template.name },
    });

    return template;
  });
}

export async function listTemplates(params: { workspaceId: string; actorUserId: string }): Promise<OutreachTemplate[]> {
  const { workspaceId, actorUserId } = params;
  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");
    return tx
      .select()
      .from(outreachTemplates)
      .where(eq(outreachTemplates.workspaceId, workspaceId))
      .orderBy(desc(outreachTemplates.createdAt));
  });
}

export async function getTemplate(params: {
  workspaceId: string;
  actorUserId: string;
  templateId: string;
}): Promise<OutreachTemplate> {
  const { workspaceId, actorUserId, templateId } = params;
  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");
    const [template] = await tx.select().from(outreachTemplates).where(eq(outreachTemplates.id, templateId)).limit(1);
    if (!template) throw new NotFoundError(`No template with id ${templateId}`);
    return template;
  });
}

export async function updateTemplate(params: {
  workspaceId: string;
  actorUserId: string;
  templateId: string;
  name?: string;
  subject?: string | null;
  body?: string | null;
  variables?: string[] | null;
  status?: TemplateStatus;
}): Promise<OutreachTemplate> {
  const { workspaceId, actorUserId, templateId, name, subject, body, variables, status } = params;
  if (name !== undefined && name.trim().length === 0) {
    throw new ValidationError("name must not be empty");
  }

  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");

    const [existing] = await tx.select().from(outreachTemplates).where(eq(outreachTemplates.id, templateId)).limit(1);
    if (!existing) throw new NotFoundError(`No template with id ${templateId}`);

    const patch: Record<string, unknown> = {};
    if (name !== undefined) patch.name = name.trim();
    if (subject !== undefined) patch.subject = subject;
    if (body !== undefined) patch.body = body;
    if (variables !== undefined) patch.variables = variables;
    if (status !== undefined) patch.status = status;

    if (Object.keys(patch).length === 0) {
      return existing;
    }

    const updated = oneOrThrow(
      await tx.update(outreachTemplates).set(patch).where(eq(outreachTemplates.id, templateId)).returning(),
      "update template"
    );

    await writeAuditLog(tx, {
      workspaceId,
      actorUserId,
      action: "template.updated",
      entityType: "outreach_template",
      entityId: updated.id,
      metadata: { patch },
    });

    return updated;
  });
}

/**
 * Assigns a template to a campaign for one segment (plan §9/§14.5). One
 * template per (campaign_id, assignment_segment) — the Phase 1 unique
 * index enforces this; re-assigning the same segment replaces the prior
 * template for it via upsert, it never creates a second row.
 */
export async function assignTemplateToCampaign(params: {
  workspaceId: string;
  actorUserId: string;
  campaignId: string;
  templateId: string;
  assignmentSegment: string;
}): Promise<CampaignTemplate> {
  const { workspaceId, actorUserId, campaignId, templateId, assignmentSegment } = params;
  if (!assignmentSegment || assignmentSegment.trim().length === 0) {
    throw new ValidationError("assignmentSegment is required");
  }

  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");

    const [campaign] = await tx.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
    if (!campaign) throw new NotFoundError(`No campaign with id ${campaignId}`);

    const [template] = await tx.select().from(outreachTemplates).where(eq(outreachTemplates.id, templateId)).limit(1);
    if (!template) throw new NotFoundError(`No template with id ${templateId}`);

    const segment = assignmentSegment.trim();

    const existing = await tx
      .select()
      .from(campaignTemplates)
      .where(and(eq(campaignTemplates.campaignId, campaignId), eq(campaignTemplates.assignmentSegment, segment)))
      .limit(1);

    if (existing[0]) {
      const updated = oneOrThrow(
        await tx
          .update(campaignTemplates)
          .set({ templateId })
          .where(eq(campaignTemplates.id, existing[0].id))
          .returning(),
        "reassign campaign template"
      );
      await writeAuditLog(tx, {
        workspaceId,
        actorUserId,
        action: "campaign.template_reassigned",
        entityType: "campaign_template",
        entityId: updated.id,
        metadata: { campaignId, templateId, assignmentSegment: segment },
      });
      return updated;
    }

    const row = oneOrThrow(
      await tx
        .insert(campaignTemplates)
        .values({ workspaceId, campaignId, templateId, assignmentSegment: segment })
        .returning(),
      "assign campaign template"
    );

    await writeAuditLog(tx, {
      workspaceId,
      actorUserId,
      action: "campaign.template_assigned",
      entityType: "campaign_template",
      entityId: row.id,
      metadata: { campaignId, templateId, assignmentSegment: segment },
    });

    return row;
  });
}

export async function listCampaignTemplates(params: {
  workspaceId: string;
  actorUserId: string;
  campaignId: string;
}): Promise<CampaignTemplate[]> {
  const { workspaceId, actorUserId, campaignId } = params;
  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");
    return tx.select().from(campaignTemplates).where(eq(campaignTemplates.campaignId, campaignId));
  });
}
