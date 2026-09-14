import { NextResponse } from "next/server";
import { getOutreachDraft, editOutreachDraft } from "@rdv/domain";
import { requireSession } from "../../../../lib/session";
import { errorResponse } from "../../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Wave 2 Phase 6 (plan §11): GET reads a single draft. PATCH edits its content — necessary for the acceptance criterion "editing a draft invalidates its approval"; not its own named route in the plan's API list, but the only mechanism that criterion can be tested through. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const draft = await getOutreachDraft({ workspaceId: actor.workspaceId, actorUserId: actor.userId, draftId: params.id });
    return NextResponse.json(draft);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const body = await req.json().catch(() => ({}));

    const draft = await editOutreachDraft({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      draftId: params.id,
      subject: typeof body?.subject === "string" ? body.subject : undefined,
      body: typeof body?.body === "string" ? body.body : undefined,
    });
    return NextResponse.json(draft);
  } catch (err) {
    return errorResponse(err);
  }
}
