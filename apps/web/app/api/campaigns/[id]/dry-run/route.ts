import { NextResponse } from "next/server";
import { requestDryRun } from "@rdv/domain";
import { requireSession } from "../../../../../lib/session";
import { errorResponse } from "../../../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Wave 2 Phase 7 (plan §12): enqueues a dry-run evaluation of every shortlisted creator on this campaign — zero outbound network calls, ever. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const result = await requestDryRun({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      campaignId: params.id,
    });
    return NextResponse.json(result, { status: 202 });
  } catch (err) {
    return errorResponse(err);
  }
}
