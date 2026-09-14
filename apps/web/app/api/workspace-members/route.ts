import { NextResponse } from "next/server";
import { listMembers } from "@rdv/auth";
import { requireSession } from "../../../lib/session";
import { errorResponse } from "../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Owner/Admin-facing member list, incl. whether each member still needs a setup link (plan §5). */
export async function GET() {
  try {
    const actor = await requireSession();
    const members = await listMembers(actor.workspaceId);
    return NextResponse.json(members);
  } catch (err) {
    return errorResponse(err);
  }
}
