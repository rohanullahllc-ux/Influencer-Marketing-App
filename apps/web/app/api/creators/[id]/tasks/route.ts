import { NextResponse } from "next/server";
import { createCreatorTask, listCreatorTasks } from "@rdv/domain";
import { ValidationError } from "@rdv/lib";
import { requireSession } from "../../../../../lib/session";
import { errorResponse } from "../../../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Wave 4 (Creator CRM): human-managed follow-up tasks on a creator. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const tasks = await listCreatorTasks({ workspaceId: actor.workspaceId, actorUserId: actor.userId, creatorId: params.id });
    return NextResponse.json(tasks);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const body = await req.json().catch(() => null);
    const title = typeof body?.title === "string" ? body.title : undefined;
    if (!title) throw new ValidationError("title is required");

    const task = await createCreatorTask({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      creatorId: params.id,
      title,
      campaignId: typeof body?.campaignId === "string" ? body.campaignId : undefined,
      dueAt: typeof body?.dueAt === "string" ? new Date(body.dueAt) : undefined,
      assignedTo: typeof body?.assignedTo === "string" ? body.assignedTo : undefined,
    });
    return NextResponse.json(task, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
