import { NextResponse } from "next/server";
import { getCreatorHistory } from "@rdv/domain";
import { requireSession } from "../../../../../lib/session";
import { errorResponse } from "../../../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Wave 4 (Creator CRM): real outreach/reply history for a creator, read live from Wave 3's tables — never a CRM-only copy. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const history = await getCreatorHistory({ workspaceId: actor.workspaceId, actorUserId: actor.userId, creatorId: params.id });
    return NextResponse.json(history);
  } catch (err) {
    return errorResponse(err);
  }
}
