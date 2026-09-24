import { NextResponse } from "next/server";
import { getCreatorConversationSummaryRunStatus } from "@rdv/domain";
import { requireSession } from "../../../../../../lib/session";
import { errorResponse } from "../../../../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Wave 4 (Creator CRM): poll a conversation-summary run's status — the BullMQ job itself is the run record, same pattern as replies. */
export async function GET(_req: Request, { params }: { params: { runId: string } }) {
  try {
    const actor = await requireSession();
    const status = await getCreatorConversationSummaryRunStatus({ workspaceId: actor.workspaceId, actorUserId: actor.userId, runId: params.runId });
    return NextResponse.json(status);
  } catch (err) {
    return errorResponse(err);
  }
}
