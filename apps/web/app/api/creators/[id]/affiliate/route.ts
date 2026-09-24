import { NextResponse } from "next/server";
import { requestAffiliateCreation, listCreatorAffiliatesForCreator } from "@rdv/domain";
import { requireSession } from "../../../../../lib/session";
import { errorResponse } from "../../../../../lib/apiError";

export const dynamic = "force-dynamic";

/**
 * Wave 4 (Whop Affiliate/Conversion): GET lists affiliate relationships for
 * this creator; POST is the human-triggered affiliate creation request —
 * there is no other code path that can create one (admin-only, enforced
 * in the domain layer).
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const affiliates = await listCreatorAffiliatesForCreator({ workspaceId: actor.workspaceId, actorUserId: actor.userId, creatorId: params.id });
    return NextResponse.json(affiliates);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const body = await req.json().catch(() => ({}));
    const affiliate = await requestAffiliateCreation({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      creatorId: params.id,
      campaignId: typeof body?.campaignId === "string" ? body.campaignId : undefined,
      commercialMetadata: body?.commercialMetadata && typeof body.commercialMetadata === "object" ? body.commercialMetadata : undefined,
    });
    return NextResponse.json(affiliate, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
