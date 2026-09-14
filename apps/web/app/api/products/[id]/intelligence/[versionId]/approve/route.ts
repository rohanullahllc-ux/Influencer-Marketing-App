import { NextResponse } from "next/server";
import { approveProductIntelligence } from "@rdv/domain";
import { requireSession } from "../../../../../../../lib/session";
import { errorResponse } from "../../../../../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Wave 2 Phase 2 (plan §7, §14.2): explicit, separately-tracked approval — Admin-only, never auto-approved. */
export async function POST(_req: Request, { params }: { params: { id: string; versionId: string } }) {
  try {
    const actor = await requireSession();
    const approved = await approveProductIntelligence({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      intelligenceId: params.versionId,
    });
    return NextResponse.json(approved);
  } catch (err) {
    return errorResponse(err);
  }
}
