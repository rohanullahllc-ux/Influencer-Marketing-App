import { NextResponse } from "next/server";
import { assignTemplateToCampaign, listCampaignTemplates } from "@rdv/domain";
import { ValidationError } from "@rdv/lib";
import { requireSession } from "../../../../../lib/session";
import { errorResponse } from "../../../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Wave 2 Phase 4 (plan §9): GET lists this campaign's segment→template assignments; POST assigns one (simple V1 segment dimension, not A/B testing). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const assignments = await listCampaignTemplates({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      campaignId: params.id,
    });
    return NextResponse.json(assignments);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const body = await req.json().catch(() => null);
    const templateId = typeof body?.templateId === "string" ? body.templateId : undefined;
    const assignmentSegment = typeof body?.assignmentSegment === "string" ? body.assignmentSegment : undefined;
    if (!templateId) throw new ValidationError("templateId is required");
    if (!assignmentSegment) throw new ValidationError("assignmentSegment is required");

    const row = await assignTemplateToCampaign({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      campaignId: params.id,
      templateId,
      assignmentSegment,
    });
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
