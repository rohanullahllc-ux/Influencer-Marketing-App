import { NextResponse } from "next/server";
import { getReplyIntelligenceRunStatus } from "@rdv/domain";
import { requireSession } from "../../../../../lib/session";
import { errorResponse } from "../../../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Wave 3: poll a reply-classification run's status — the BullMQ job itself is the run record, same pattern as Phase 3/5/6. */
export async function GET(_req: Request, { params }: { params: { runId: string } }) {
  try {
    const actor = await requireSession();
    const status = await getReplyIntelligenceRunStatus({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      runId: params.runId,
    });
    return NextResponse.json(status);
  } catch (err) {
    return errorResponse(err);
  }
}
