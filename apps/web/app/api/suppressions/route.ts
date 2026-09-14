import { NextResponse } from "next/server";
import { addSuppression, listSuppressions } from "@rdv/domain";
import { ValidationError } from "@rdv/lib";
import { requireSession } from "../../../lib/session";
import { errorResponse } from "../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Wave 2 Phase 7 (plan §12): minimal suppression/DNC list — list/add. Durable — no delete route exists. */
export async function GET() {
  try {
    const actor = await requireSession();
    const suppressions = await listSuppressions({ workspaceId: actor.workspaceId, actorUserId: actor.userId });
    return NextResponse.json(suppressions);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requireSession();
    const body = await req.json().catch(() => null);
    const identity = typeof body?.identity === "string" ? body.identity : undefined;
    if (!identity) throw new ValidationError("identity is required");

    const suppression = await addSuppression({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      identity,
      reason: typeof body?.reason === "string" ? body.reason : undefined,
    });
    return NextResponse.json(suppression, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
