import { NextResponse } from "next/server";
import { createCampaign, listCampaigns, type CampaignInput } from "@rdv/domain";
import { ValidationError } from "@rdv/lib";
import { requireSession } from "../../../lib/session";
import { errorResponse } from "../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Wave 2 Phase 4 (plan §9): Campaign CRUD — list/create, every §14.5 field settable on create. */
export async function GET() {
  try {
    const actor = await requireSession();
    const campaigns = await listCampaigns({ workspaceId: actor.workspaceId, actorUserId: actor.userId });
    return NextResponse.json(campaigns);
  } catch (err) {
    return errorResponse(err);
  }
}

function readCampaignInput(body: Record<string, unknown> | null): CampaignInput {
  const productId = typeof body?.productId === "string" ? body.productId : undefined;
  const name = typeof body?.name === "string" ? body.name : undefined;
  if (!productId) throw new ValidationError("productId is required");
  if (!name) throw new ValidationError("name is required");

  return {
    productId,
    name,
    objective: typeof body?.objective === "string" ? body.objective : undefined,
    targetGeography: Array.isArray(body?.targetGeography) ? (body.targetGeography as string[]) : undefined,
    targetLanguages: Array.isArray(body?.targetLanguages) ? (body.targetLanguages as string[]) : undefined,
    creatorTypes: Array.isArray(body?.creatorTypes) ? (body.creatorTypes as string[]) : undefined,
    qualificationThresholds:
      body?.qualificationThresholds && typeof body.qualificationThresholds === "object"
        ? (body.qualificationThresholds as Record<string, unknown>)
        : undefined,
    nicheRequirements: Array.isArray(body?.nicheRequirements) ? (body.nicheRequirements as string[]) : undefined,
    startDate: typeof body?.startDate === "string" ? body.startDate : undefined,
    endDate: typeof body?.endDate === "string" ? body.endDate : undefined,
    outreachStrategy: typeof body?.outreachStrategy === "string" ? body.outreachStrategy : undefined,
    sendingLimits:
      body?.sendingLimits && typeof body.sendingLimits === "object" ? (body.sendingLimits as Record<string, unknown>) : undefined,
    firstSendCap: typeof body?.firstSendCap === "number" ? body.firstSendCap : undefined,
    followUpRules:
      body?.followUpRules && typeof body.followUpRules === "object" ? (body.followUpRules as Record<string, unknown>) : undefined,
    sendingWindow:
      body?.sendingWindow && typeof body.sendingWindow === "object" ? (body.sendingWindow as Record<string, unknown>) : undefined,
  };
}

export async function POST(req: Request) {
  try {
    const actor = await requireSession();
    const body = await req.json().catch(() => null);
    const input = readCampaignInput(body);

    const campaign = await createCampaign({ workspaceId: actor.workspaceId, actorUserId: actor.userId, input });
    return NextResponse.json(campaign, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
