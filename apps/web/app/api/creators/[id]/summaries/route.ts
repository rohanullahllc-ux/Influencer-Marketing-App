import { NextResponse } from "next/server";
import { requestCreatorConversationSummary, listCreatorConversationSummaries } from "@rdv/domain";
import { requireSession } from "../../../../../lib/session";
import { errorResponse } from "../../../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Wave 4 (Creator CRM): GET lists past AI conversation summaries (append-only); POST enqueues a fresh one. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const summaries = await listCreatorConversationSummaries({ workspaceId: actor.workspaceId, actorUserId: actor.userId, creatorId: params.id });
    return NextResponse.json(summaries);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const body = await req.json().catch(() => ({}));
    const result = await requestCreatorConversationSummary({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      creatorId: params.id,
      campaignId: typeof body?.campaignId === "string" ? body.campaignId : undefined,
    });
    return NextResponse.json(result, { status: 202 });
  } catch (err) {
    return errorResponse(err);
  }
}
