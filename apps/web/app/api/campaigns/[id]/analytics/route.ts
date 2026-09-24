import { NextResponse } from "next/server";
import { getCampaignAnalytics } from "@rdv/domain";
import { requireSession } from "../../../../../lib/session";
import { errorResponse } from "../../../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Wave 5 (Analytics): the per-campaign rollup, computed live from real stored rows. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const summary = await getCampaignAnalytics({ workspaceId: actor.workspaceId, actorUserId: actor.userId, campaignId: params.id });
    return NextResponse.json(summary);
  } catch (err) {
    return errorResponse(err);
  }
}
