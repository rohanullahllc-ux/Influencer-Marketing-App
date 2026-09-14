import { NextResponse } from "next/server";
import { getCampaign, updateCampaign, type CampaignInput, type CampaignStatus } from "@rdv/domain";
import { ValidationError } from "@rdv/lib";
import { requireSession } from "../../../../lib/session";
import { errorResponse } from "../../../../lib/apiError";

export const dynamic = "force-dynamic";

const VALID_STATUSES: CampaignStatus[] = ["draft", "active", "paused", "archived"];

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const campaign = await getCampaign({ workspaceId: actor.workspaceId, actorUserId: actor.userId, campaignId: params.id });
    return NextResponse.json(campaign);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const body = await req.json().catch(() => ({}));

    const status = body?.status;
    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      throw new ValidationError(`status must be one of: ${VALID_STATUSES.join(", ")}`);
    }

    const input: Partial<CampaignInput> & { status?: CampaignStatus } = {};
    if (typeof body?.name === "string") input.name = body.name;
    if (typeof body?.objective === "string") input.objective = body.objective;
    if (Array.isArray(body?.targetGeography)) input.targetGeography = body.targetGeography;
    if (Array.isArray(body?.targetLanguages)) input.targetLanguages = body.targetLanguages;
    if (Array.isArray(body?.creatorTypes)) input.creatorTypes = body.creatorTypes;
    if (body?.qualificationThresholds && typeof body.qualificationThresholds === "object")
      input.qualificationThresholds = body.qualificationThresholds;
    if (Array.isArray(body?.nicheRequirements)) input.nicheRequirements = body.nicheRequirements;
    if (typeof body?.startDate === "string") input.startDate = body.startDate;
    if (typeof body?.endDate === "string") input.endDate = body.endDate;
    if (typeof body?.outreachStrategy === "string") input.outreachStrategy = body.outreachStrategy;
    if (body?.sendingLimits && typeof body.sendingLimits === "object") input.sendingLimits = body.sendingLimits;
    if (typeof body?.firstSendCap === "number") input.firstSendCap = body.firstSendCap;
    if (body?.followUpRules && typeof body.followUpRules === "object") input.followUpRules = body.followUpRules;
    if (body?.sendingWindow && typeof body.sendingWindow === "object") input.sendingWindow = body.sendingWindow;
    if (status !== undefined) input.status = status;

    const campaign = await updateCampaign({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      campaignId: params.id,
      input,
    });
    return NextResponse.json(campaign);
  } catch (err) {
    return errorResponse(err);
  }
}
