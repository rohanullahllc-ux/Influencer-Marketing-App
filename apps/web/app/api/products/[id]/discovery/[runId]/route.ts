import { NextResponse } from "next/server";
import { getCreatorDiscoveryRunStatus } from "@rdv/domain";
import { requireSession } from "../../../../../../lib/session";
import { errorResponse } from "../../../../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Wave 2 Phase 3 (plan §8): poll a discovery run's status — the BullMQ job itself is the run record, no separate tracking table. */
export async function GET(_req: Request, { params }: { params: { id: string; runId: string } }) {
  try {
    const actor = await requireSession();
    const status = await getCreatorDiscoveryRunStatus({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      runId: params.runId,
    });
    return NextResponse.json(status);
  } catch (err) {
    return errorResponse(err);
  }
}
