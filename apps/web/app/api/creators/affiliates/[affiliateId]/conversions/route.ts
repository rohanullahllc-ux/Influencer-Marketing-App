import { NextResponse } from "next/server";
import { listConversionsForAffiliate } from "@rdv/domain";
import { requireSession } from "../../../../../../lib/session";
import { errorResponse } from "../../../../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Wave 4 (Whop Affiliate/Conversion): real conversion events attributed to this affiliate relationship, populated only by the polling reconciliation job — never fabricated. */
export async function GET(_req: Request, { params }: { params: { affiliateId: string } }) {
  try {
    const actor = await requireSession();
    const conversions = await listConversionsForAffiliate({ workspaceId: actor.workspaceId, actorUserId: actor.userId, creatorAffiliateId: params.affiliateId });
    return NextResponse.json(conversions);
  } catch (err) {
    return errorResponse(err);
  }
}
