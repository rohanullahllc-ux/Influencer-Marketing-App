import { NextResponse } from "next/server";
import { setAiMockMode } from "@rdv/auth";
import { ValidationError } from "@rdv/lib";
import { requireSession } from "../../../../lib/session";
import { errorResponse } from "../../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Owner/Admin-only toggle for Mock AI mode (see packages/auth/src/workspaceSettings.ts). */
export async function POST(req: Request) {
  try {
    const actor = await requireSession();
    const body = await req.json().catch(() => null);
    const enabled = body?.enabled;

    if (typeof enabled !== "boolean") {
      throw new ValidationError("enabled must be a boolean");
    }

    await setAiMockMode({ workspaceId: actor.workspaceId, actorUserId: actor.userId, enabled });
    return NextResponse.json({ ok: true, enabled });
  } catch (err) {
    return errorResponse(err);
  }
}
