import { NextResponse } from "next/server";
import { requestProductIntelligenceGeneration, listProductIntelligenceVersions } from "@rdv/domain";
import { requireSession } from "../../../../../lib/session";
import { errorResponse } from "../../../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Wave 2 Phase 2 (plan §7): GET lists every version (draft/approved/superseded) for the review panel; POST enqueues async AI generation of a new draft. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const versions = await listProductIntelligenceVersions({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      productId: params.id,
    });
    return NextResponse.json(versions);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const result = await requestProductIntelligenceGeneration({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      productId: params.id,
    });
    return NextResponse.json(result, { status: 202 });
  } catch (err) {
    return errorResponse(err);
  }
}
