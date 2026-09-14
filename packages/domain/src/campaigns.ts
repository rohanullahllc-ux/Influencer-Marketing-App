import { and, desc, eq } from "drizzle-orm";
import { withWorkspace, writeAuditLog, schema } from "@rdv/db";
import { requireRole } from "@rdv/auth";
import { NotFoundError, ValidationError, oneOrThrow } from "@rdv/lib";
import type { Campaign, CampaignCreator } from "./entities.js";

const { campaigns, campaignCreators, products, creators, workspaceMembers } = schema;

/**
 * Wave 2 Phase 4 (plan §9): Campaign CRUD, covering every locked field from
 * plan §14.5. Mirrors Phase 2/3's exact requireRole + audit-log +
 * withWorkspace shape. No AB-testing infra, no outreach sending, no
 * qualification/matching logic here — those are Phase 5/6/7's own files.
 */

const CAMPAIGN_STATUSES = ["draft", "active", "paused", "archived"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export interface CampaignInput {
  productId: string;
  name: string;
  objective?: string | null;
  targetGeography?: string[] | null;
  targetLanguages?: string[] | null;
  creatorTypes?: string[] | null;
  qualificationThresholds?: Record<string, unknown> | null;
  nicheRequirements?: string[] | null;
  startDate?: string | null;
  endDate?: string | null;
  outreachStrategy?: string | null;
  sendingLimits?: Record<string, unknown> | null;
  firstSendCap?: number | null;
  followUpRules?: Record<string, unknown> | null;
  sendingWindow?: Record<string, unknown> | null;
}

async function requireActorRole(
  tx: Parameters<Parameters<typeof withWorkspace>[1]>[0],
  actorUserId: string,
  minimum: "member_operator" | "admin" | "owner"
): Promise<void> {
  const [actorMembership] = await tx.select().from(workspaceMembers).where(eq(workspaceMembers.userId, actorUserId));
  requireRole(actorMembership?.role, minimum);
}

export async function createCampaign(params: {
  workspaceId: string;
  actorUserId: string;
  input: CampaignInput;
}): Promise<Campaign> {
  const { workspaceId, actorUserId, input } = params;
  if (!input.name || input.name.trim().length === 0) {
    throw new ValidationError("name is required to create a campaign");
  }
  if (
    input.firstSendCap !== undefined &&
    input.firstSendCap !== null &&
    (!Number.isInteger(input.firstSendCap) || input.firstSendCap < 0)
  ) {
    throw new ValidationError("firstSendCap must be a non-negative integer");
  }

  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");

    const [product] = await tx.select().from(products).where(eq(products.id, input.productId)).limit(1);
    if (!product) throw new NotFoundError(`No product with id ${input.productId}`);

    const campaign = oneOrThrow(
      await tx
        .insert(campaigns)
        .values({
          workspaceId,
          productId: input.productId,
          name: input.name.trim(),
          objective: input.objective ?? null,
          targetGeography: input.targetGeography ?? null,
          targetLanguages: input.targetLanguages ?? null,
          creatorTypes: input.creatorTypes ?? null,
          qualificationThresholds: input.qualificationThresholds ?? null,
          nicheRequirements: input.nicheRequirements ?? null,
          startDate: input.startDate ?? null,
          endDate: input.endDate ?? null,
          outreachStrategy: input.outreachStrategy ?? null,
          sendingLimits: input.sendingLimits ?? null,
          firstSendCap: input.firstSendCap ?? null,
          followUpRules: input.followUpRules ?? null,
          sendingWindow: input.sendingWindow ?? null,
          createdBy: actorUserId,
        })
        .returning(),
      "insert campaign"
    );

    await writeAuditLog(tx, {
      workspaceId,
      actorUserId,
      action: "campaign.created",
      entityType: "campaign",
      entityId: campaign.id,
      metadata: { name: campaign.name, productId: input.productId },
    });

    return campaign;
  });
}

export async function listCampaigns(params: { workspaceId: string; actorUserId: string }): Promise<Campaign[]> {
  const { workspaceId, actorUserId } = params;
  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");
    return tx.select().from(campaigns).where(eq(campaigns.workspaceId, workspaceId)).orderBy(desc(campaigns.createdAt));
  });
}

export async function getCampaign(params: {
  workspaceId: string;
  actorUserId: string;
  campaignId: string;
}): Promise<Campaign> {
  const { workspaceId, actorUserId, campaignId } = params;
  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");
    const [campaign] = await tx.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
    if (!campaign) throw new NotFoundError(`No campaign with id ${campaignId}`);
    return campaign;
  });
}

export async function updateCampaign(params: {
  workspaceId: string;
  actorUserId: string;
  campaignId: string;
  input: Partial<CampaignInput> & { status?: CampaignStatus };
}): Promise<Campaign> {
  const { workspaceId, actorUserId, campaignId, input } = params;
  if (input.name !== undefined && input.name.trim().length === 0) {
    throw new ValidationError("name must not be empty");
  }
  if (
    input.firstSendCap !== undefined &&
    input.firstSendCap !== null &&
    (!Number.isInteger(input.firstSendCap) || input.firstSendCap < 0)
  ) {
    throw new ValidationError("firstSendCap must be a non-negative integer");
  }

  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");

    const [existing] = await tx.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
    if (!existing) throw new NotFoundError(`No campaign with id ${campaignId}`);

    const patch: Record<string, unknown> = {};
    for (const key of [
      "name",
      "objective",
      "targetGeography",
      "targetLanguages",
      "creatorTypes",
      "qualificationThresholds",
      "nicheRequirements",
      "startDate",
      "endDate",
      "outreachStrategy",
      "sendingLimits",
      "firstSendCap",
      "followUpRules",
      "sendingWindow",
      "status",
    ] as const) {
      if (input[key] !== undefined) {
        patch[key] = key === "name" ? (input.name as string).trim() : input[key];
      }
    }

    if (Object.keys(patch).length === 0) {
      return existing;
    }

    const updated = oneOrThrow(
      await tx.update(campaigns).set(patch).where(eq(campaigns.id, campaignId)).returning(),
      "update campaign"
    );

    await writeAuditLog(tx, {
      workspaceId,
      actorUserId,
      action: "campaign.updated",
      entityType: "campaign",
      entityId: updated.id,
      metadata: { patch },
    });

    return updated;
  });
}

const SHORTLIST_STATUSES = ["shortlisted", "selected", "excluded"] as const;
export type CampaignCreatorStatus = (typeof SHORTLIST_STATUSES)[number];

/** Adds a creator to a campaign's shortlist (plan §9). Idempotent per (campaign_id, creator_id) — the primary key. */
export async function shortlistCreator(params: {
  workspaceId: string;
  actorUserId: string;
  campaignId: string;
  creatorId: string;
}): Promise<CampaignCreator> {
  const { workspaceId, actorUserId, campaignId, creatorId } = params;

  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");

    const [campaign] = await tx.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
    if (!campaign) throw new NotFoundError(`No campaign with id ${campaignId}`);

    const [creator] = await tx.select().from(creators).where(eq(creators.id, creatorId)).limit(1);
    if (!creator) throw new NotFoundError(`No creator with id ${creatorId}`);

    const row = oneOrThrow(
      await tx
        .insert(campaignCreators)
        .values({ workspaceId, campaignId, creatorId, addedBy: actorUserId })
        .onConflictDoUpdate({
          target: [campaignCreators.campaignId, campaignCreators.creatorId],
          set: { addedBy: actorUserId },
        })
        .returning(),
      "shortlist creator"
    );

    await writeAuditLog(tx, {
      workspaceId,
      actorUserId,
      action: "campaign.creator_shortlisted",
      entityType: "campaign_creator",
      entityId: `${campaignId}:${creatorId}`,
      metadata: { campaignId, creatorId },
    });

    return row;
  });
}

export async function updateCampaignCreatorStatus(params: {
  workspaceId: string;
  actorUserId: string;
  campaignId: string;
  creatorId: string;
  status: CampaignCreatorStatus;
}): Promise<CampaignCreator> {
  const { workspaceId, actorUserId, campaignId, creatorId, status } = params;

  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");

    const [existing] = await tx
      .select()
      .from(campaignCreators)
      .where(and(eq(campaignCreators.campaignId, campaignId), eq(campaignCreators.creatorId, creatorId)))
      .limit(1);
    if (!existing) throw new NotFoundError(`Creator ${creatorId} is not shortlisted on campaign ${campaignId}`);

    const updated = oneOrThrow(
      await tx
        .update(campaignCreators)
        .set({ status })
        .where(and(eq(campaignCreators.campaignId, campaignId), eq(campaignCreators.creatorId, creatorId)))
        .returning(),
      "update campaign creator status"
    );

    await writeAuditLog(tx, {
      workspaceId,
      actorUserId,
      action: "campaign.creator_status_updated",
      entityType: "campaign_creator",
      entityId: `${campaignId}:${creatorId}`,
      metadata: { status },
    });

    return updated;
  });
}

export async function listCampaignCreators(params: {
  workspaceId: string;
  actorUserId: string;
  campaignId: string;
}): Promise<CampaignCreator[]> {
  const { workspaceId, actorUserId, campaignId } = params;
  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");
    return tx.select().from(campaignCreators).where(eq(campaignCreators.campaignId, campaignId));
  });
}
