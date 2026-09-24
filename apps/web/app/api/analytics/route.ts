import { NextResponse } from "next/server";
import { getWorkspaceAnalytics } from "@rdv/domain";
import { requireSession } from "../../../lib/session";
import { errorResponse } from "../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Wave 5 (Analytics): the workspace-wide rollup, computed live from real stored rows on every request — never cached, never estimated. */
export async function GET() {
  try {
    const actor = await requireSession();
    const summary = await getWorkspaceAnalytics({ workspaceId: actor.workspaceId, actorUserId: actor.userId });
    return NextResponse.json(summary);
  } catch (err) {
    return errorResponse(err);
  }
}
