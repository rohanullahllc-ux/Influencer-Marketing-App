import { NextResponse } from "next/server";
import { qualifyCampaignCreators, listCurrentQualifications } from "@rdv/domain";
import { requireSession } from "../../../../../lib/session";
import { errorResponse } from "../../../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Wave 2 Phase 5 (plan §10): deterministic qualification — synchronous, no AI. GET reads the current (latest per creator) qualification results; POST re-evaluates the whole shortlist against the campaign's current thresholds/niche requirements. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const results = await listCurrentQualifications({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      campaignId: params.id,
    });
    return NextResponse.json(results);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const results = await qualifyCampaignCreators({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      campaignId: params.id,
    });
    return NextResponse.json(results);
  } catch (err) {
    return errorResponse(err);
  }
}
