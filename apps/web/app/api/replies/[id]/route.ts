import { NextResponse } from "next/server";
import { getInboundMessage } from "@rdv/domain";
import { requireSession } from "../../../../lib/session";
import { errorResponse } from "../../../../lib/apiError";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const message = await getInboundMessage({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      inboundMessageId: params.id,
    });
    return NextResponse.json(message);
  } catch (err) {
    return errorResponse(err);
  }
}
