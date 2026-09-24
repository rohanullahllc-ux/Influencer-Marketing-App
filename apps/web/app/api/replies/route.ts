import { NextResponse } from "next/server";
import { listInboundMessages } from "@rdv/domain";
import { requireSession } from "../../../lib/session";
import { errorResponse } from "../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Wave 3: the reply inbox — every inbound message, optionally filtered by match_status. */
export async function GET(req: Request) {
  try {
    const actor = await requireSession();
    const url = new URL(req.url);
    const matchStatus = url.searchParams.get("matchStatus") as "matched" | "ambiguous" | "unknown" | null;
    const messages = await listInboundMessages({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      matchStatus: matchStatus ?? undefined,
    });
    return NextResponse.json(messages);
  } catch (err) {
    return errorResponse(err);
  }
}
