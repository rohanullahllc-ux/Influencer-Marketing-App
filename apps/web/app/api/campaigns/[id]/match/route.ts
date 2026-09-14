import { NextResponse } from "next/server";
import { requestCreatorMatching, listCurrentMatches } from "@rdv/domain";
import { requireSession } from "../../../../../lib/session";
import { errorResponse } from "../../../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Wave 2 Phase 5 (plan §10): AI creator-match explanation — async via ai-ops. GET reads the current (latest per creator) match results; POST enqueues a fresh run for the whole shortlist. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const results = await listCurrentMatches({
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
    const result = await requestCreatorMatching({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      campaignId: params.id,
    });
    return NextResponse.json(result, { status: 202 });
  } catch (err) {
    return errorResponse(err);
  }
}
