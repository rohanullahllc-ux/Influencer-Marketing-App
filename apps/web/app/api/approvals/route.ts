import { NextResponse } from "next/server";
import { listApprovalQueue, type ApprovalStatus } from "@rdv/domain";
import { ValidationError } from "@rdv/lib";
import { requireSession } from "../../../lib/session";
import { errorResponse } from "../../../lib/apiError";

export const dynamic = "force-dynamic";

const VALID_STATUSES: ApprovalStatus[] = ["pending", "approved", "rejected", "returned_for_edit", "invalidated"];

/** Wave 2 Phase 6 (plan §11): the single founder-facing approval queue across all campaigns, filterable by status. */
export async function GET(req: Request) {
  try {
    const actor = await requireSession();
    const statusParam = new URL(req.url).searchParams.get("status");
    if (statusParam && !VALID_STATUSES.includes(statusParam as ApprovalStatus)) {
      throw new ValidationError(`status must be one of: ${VALID_STATUSES.join(", ")}`);
    }

    const approvals = await listApprovalQueue({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      status: (statusParam as ApprovalStatus | null) ?? undefined,
    });
    return NextResponse.json(approvals);
  } catch (err) {
    return errorResponse(err);
  }
}
