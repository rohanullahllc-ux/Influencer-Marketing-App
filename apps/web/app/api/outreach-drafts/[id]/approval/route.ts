import { NextResponse } from "next/server";
import { createApprovalForDraft } from "@rdv/domain";
import { requireSession } from "../../../../../lib/session";
import { errorResponse } from "../../../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Wave 2 Phase 6 (plan §11): submits a draft's current content for approval — the content-pinning moment (exact_subject/exact_body snapshotted here). Necessary for GET /api/approvals to ever have anything to list; not its own named route in the plan's API list, same class of necessity as the draft-edit route. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const approval = await createApprovalForDraft({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      draftId: params.id,
    });
    return NextResponse.json(approval, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
