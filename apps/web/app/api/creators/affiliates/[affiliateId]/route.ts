import { NextResponse } from "next/server";
import { getCreatorAffiliate } from "@rdv/domain";
import { requireSession } from "../../../../../lib/session";
import { errorResponse } from "../../../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Wave 4 (Whop Affiliate/Conversion): poll a single affiliate's status — the durable creator_affiliates row is the run record, same pattern as outreach sends (a real Whop call may not resolve instantly). */
export async function GET(_req: Request, { params }: { params: { affiliateId: string } }) {
  try {
    const actor = await requireSession();
    const affiliate = await getCreatorAffiliate({ workspaceId: actor.workspaceId, actorUserId: actor.userId, creatorAffiliateId: params.affiliateId });
    return NextResponse.json(affiliate);
  } catch (err) {
    return errorResponse(err);
  }
}
