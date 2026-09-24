import { NextResponse } from "next/server";
import { updateCreatorTaskStatus } from "@rdv/domain";
import { ValidationError } from "@rdv/lib";
import { requireSession } from "../../../../../../lib/session";
import { errorResponse } from "../../../../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Wave 4 (Creator CRM): move a task open -> done/cancelled. */
export async function PATCH(req: Request, { params }: { params: { id: string; taskId: string } }) {
  try {
    const actor = await requireSession();
    const body = await req.json().catch(() => null);
    const status = typeof body?.status === "string" ? body.status : undefined;
    if (!status) throw new ValidationError("status is required");

    const task = await updateCreatorTaskStatus({ workspaceId: actor.workspaceId, actorUserId: actor.userId, taskId: params.taskId, status: status as never });
    return NextResponse.json(task);
  } catch (err) {
    return errorResponse(err);
  }
}
