import { NextResponse } from "next/server";
import { requestOutreachDraftGeneration } from "@rdv/domain";
import { ValidationError } from "@rdv/lib";
import { requireSession } from "../../../lib/session";
import { errorResponse } from "../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Wave 2 Phase 6 (plan §11): enqueues async AI generation of a personalized outreach draft for one creator on one campaign. */
export async function POST(req: Request) {
  try {
    const actor = await requireSession();
    const body = await req.json().catch(() => null);
    const campaignId = typeof body?.campaignId === "string" ? body.campaignId : undefined;
    const creatorId = typeof body?.creatorId === "string" ? body.creatorId : undefined;
    const templateId = typeof body?.templateId === "string" ? body.templateId : undefined;
    if (!campaignId) throw new ValidationError("campaignId is required");
    if (!creatorId) throw new ValidationError("creatorId is required");

    const result = await requestOutreachDraftGeneration({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      campaignId,
      creatorId,
      templateId,
    });
    return NextResponse.json(result, { status: 202 });
  } catch (err) {
    return errorResponse(err);
  }
}
