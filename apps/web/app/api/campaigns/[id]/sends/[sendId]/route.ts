import { NextResponse } from "next/server";
import { getOutreachSend } from "@rdv/domain";
import { requireSession } from "../../../../../../lib/session";
import { errorResponse } from "../../../../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Wave 3: poll one send's real, durable status directly from the database. */
export async function GET(_req: Request, { params }: { params: { id: string; sendId: string } }) {
  try {
    const actor = await requireSession();
    const send = await getOutreachSend({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      outreachSendId: params.sendId,
    });
    return NextResponse.json(send);
  } catch (err) {
    return errorResponse(err);
  }
}
