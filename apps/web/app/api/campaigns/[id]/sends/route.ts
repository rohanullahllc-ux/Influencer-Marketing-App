import { NextResponse } from "next/server";
import { scheduleSend, listOutreachSendsForCampaign } from "@rdv/domain";
import { ValidationError } from "@rdv/lib";
import { requireSession } from "../../../../../lib/session";
import { errorResponse } from "../../../../../lib/apiError";

export const dynamic = "force-dynamic";

/**
 * Wave 3: GET lists every real send (scheduled/sent/failed/unknown/
 * blocked/cancelled) for this campaign; POST schedules a new one against a
 * real, approved approval. The durable `outreach_sends` row (not a BullMQ
 * job id) is the run record clients poll — see the [sendId] route — since
 * a far-future scheduled send may not execute for a long time.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const sends = await listOutreachSendsForCampaign({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      campaignId: params.id,
    });
    return NextResponse.json(sends);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request, { params: _params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const body = await req.json().catch(() => null);
    const approvalId = typeof body?.approvalId === "string" ? body.approvalId : undefined;
    if (!approvalId) throw new ValidationError("approvalId is required");

    const outreachStep = typeof body?.outreachStep === "string" ? body.outreachStep : undefined;
    const scheduledFor = typeof body?.scheduledFor === "string" ? new Date(body.scheduledFor) : null;
    const crossCampaignOverride = body?.crossCampaignOverride === true;

    const send = await scheduleSend({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      approvalId,
      outreachStep,
      scheduledFor,
      crossCampaignOverride,
    });
    return NextResponse.json(send, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
