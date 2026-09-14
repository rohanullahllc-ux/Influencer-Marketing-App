import { NextResponse } from "next/server";
import { getDryRunRunStatus, getDryRunEvaluation } from "@rdv/domain";
import { requireSession } from "../../../../../../lib/session";
import { errorResponse } from "../../../../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Wave 2 Phase 7 (plan §12): poll a dry-run's status; once completed, includes the full eligible/blocked results inline (the BullMQ job itself is the run record, same pattern as Phase 3/5/6). */
export async function GET(_req: Request, { params }: { params: { id: string; runId: string } }) {
  try {
    const actor = await requireSession();
    const status = await getDryRunRunStatus({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      runId: params.runId,
    });

    if (status.state === "completed" && status.evaluationId) {
      const { evaluation, results } = await getDryRunEvaluation({
        workspaceId: actor.workspaceId,
        actorUserId: actor.userId,
        evaluationId: status.evaluationId,
      });
      return NextResponse.json({ ...status, evaluation, results });
    }

    return NextResponse.json(status);
  } catch (err) {
    return errorResponse(err);
  }
}
