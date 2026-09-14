import { NextResponse } from "next/server";
import { issueSetupToken } from "@rdv/auth";
import { requireSession } from "../../../../../lib/session";
import { errorResponse } from "../../../../../lib/apiError";

export const dynamic = "force-dynamic";

/**
 * Owner/Admin-only: issues a one-time account-setup token for an existing
 * member (plan §5, §14.1). `issueSetupToken` itself enforces the
 * admin-minimum role check and that the target is actually a member of
 * this workspace — this route is a thin HTTP wrapper, no business logic.
 * The raw token is returned exactly once in this response and never
 * persisted anywhere except as a hash — the caller (Owner/Admin) is
 * responsible for relaying it out-of-band.
 */
export async function POST(_req: Request, { params }: { params: { userId: string } }) {
  try {
    const actor = await requireSession();
    const issued = await issueSetupToken({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      targetUserId: params.userId,
    });
    return NextResponse.json(issued);
  } catch (err) {
    return errorResponse(err);
  }
}
