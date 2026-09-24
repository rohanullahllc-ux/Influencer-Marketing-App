import { NextResponse } from "next/server";
import { requestReplyIntelligence } from "@rdv/domain";
import { requireSession } from "../../../../../lib/session";
import { errorResponse } from "../../../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Wave 3: enqueues real AI classification (+ a suggested response, when eligible) for this reply. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const result = await requestReplyIntelligence({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      inboundMessageId: params.id,
    });
    return NextResponse.json(result, { status: 202 });
  } catch (err) {
    return errorResponse(err);
  }
}
