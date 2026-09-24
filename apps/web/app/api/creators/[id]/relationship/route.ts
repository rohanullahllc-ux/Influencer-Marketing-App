import { NextResponse } from "next/server";
import { getCreatorRelationship, updateCreatorRelationship } from "@rdv/domain";
import { requireSession } from "../../../../../lib/session";
import { errorResponse } from "../../../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Wave 4 (Creator CRM): GET reads (lazily materializing 'new' on first read); PATCH updates status/next action. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const relationship = await getCreatorRelationship({ workspaceId: actor.workspaceId, actorUserId: actor.userId, creatorId: params.id });
    return NextResponse.json(relationship);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const body = await req.json().catch(() => null);
    const status = typeof body?.status === "string" ? body.status : undefined;
    const nextAction = body?.nextAction === null ? null : typeof body?.nextAction === "string" ? body.nextAction : undefined;
    const nextActionDueAt = typeof body?.nextActionDueAt === "string" ? new Date(body.nextActionDueAt) : body?.nextActionDueAt === null ? null : undefined;

    const relationship = await updateCreatorRelationship({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      creatorId: params.id,
      status: status as never,
      nextAction,
      nextActionDueAt,
    });
    return NextResponse.json(relationship);
  } catch (err) {
    return errorResponse(err);
  }
}
