import { NextResponse } from "next/server";
import { shortlistCreator, listCampaignCreators } from "@rdv/domain";
import { ValidationError } from "@rdv/lib";
import { requireSession } from "../../../../../lib/session";
import { errorResponse } from "../../../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Wave 2 Phase 4 (plan §9): GET lists the campaign's shortlist; POST adds a creator to it. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const shortlist = await listCampaignCreators({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      campaignId: params.id,
    });
    return NextResponse.json(shortlist);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const body = await req.json().catch(() => null);
    const creatorId = typeof body?.creatorId === "string" ? body.creatorId : undefined;
    if (!creatorId) throw new ValidationError("creatorId is required");

    const row = await shortlistCreator({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      campaignId: params.id,
      creatorId,
    });
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
