import { NextResponse } from "next/server";
import { getCreatorMatchingRunStatus } from "@rdv/domain";
import { requireSession } from "../../../../../../lib/session";
import { errorResponse } from "../../../../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Wave 2 Phase 5: poll a matching run's status — the BullMQ job itself is the run record. */
export async function GET(_req: Request, { params }: { params: { id: string; runId: string } }) {
  try {
    const actor = await requireSession();
    const status = await getCreatorMatchingRunStatus({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      runId: params.runId,
    });
    return NextResponse.json(status);
  } catch (err) {
    return errorResponse(err);
  }
}
