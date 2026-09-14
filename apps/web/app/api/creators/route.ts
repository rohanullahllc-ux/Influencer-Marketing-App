import { NextResponse } from "next/server";
import { createManualCreator, listCreators } from "@rdv/domain";
import { ValidationError } from "@rdv/lib";
import { requireSession } from "../../../lib/session";
import { errorResponse } from "../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Wave 2 Phase 3 (plan §8): GET lists every creator in the workspace (discovered + manual); POST adds a manual creator (provenance: human_entered), independent of any discovery run. */
export async function GET() {
  try {
    const actor = await requireSession();
    const creators = await listCreators({ workspaceId: actor.workspaceId, actorUserId: actor.userId });
    return NextResponse.json(creators);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requireSession();
    const body = await req.json().catch(() => null);
    const displayName = typeof body?.displayName === "string" ? body.displayName : undefined;

    if (!displayName) {
      throw new ValidationError("displayName is required");
    }

    const creator = await createManualCreator({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      displayName,
      channelUrl: typeof body?.channelUrl === "string" ? body.channelUrl : undefined,
      niche: typeof body?.niche === "string" ? body.niche : undefined,
      country: typeof body?.country === "string" ? body.country : undefined,
      contactEmail: typeof body?.contactEmail === "string" ? body.contactEmail : undefined,
    });
    return NextResponse.json(creator, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
