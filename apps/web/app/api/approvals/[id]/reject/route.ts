import { NextResponse } from "next/server";
import { decideApproval } from "@rdv/domain";
import { requireSession } from "../../../../../lib/session";
import { errorResponse } from "../../../../../lib/apiError";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const body = await req.json().catch(() => ({}));
    const approval = await decideApproval({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      approvalId: params.id,
      decision: "reject",
      notes: typeof body?.notes === "string" ? body.notes : undefined,
    });
    return NextResponse.json(approval);
  } catch (err) {
    return errorResponse(err);
  }
}
