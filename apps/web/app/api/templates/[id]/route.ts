import { NextResponse } from "next/server";
import { getTemplate, updateTemplate, type TemplateStatus } from "@rdv/domain";
import { ValidationError } from "@rdv/lib";
import { requireSession } from "../../../../lib/session";
import { errorResponse } from "../../../../lib/apiError";

export const dynamic = "force-dynamic";

const VALID_STATUSES: TemplateStatus[] = ["draft", "active", "archived"];

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const template = await getTemplate({ workspaceId: actor.workspaceId, actorUserId: actor.userId, templateId: params.id });
    return NextResponse.json(template);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const body = await req.json().catch(() => ({}));

    const status = body?.status;
    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      throw new ValidationError(`status must be one of: ${VALID_STATUSES.join(", ")}`);
    }

    const template = await updateTemplate({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      templateId: params.id,
      name: typeof body?.name === "string" ? body.name : undefined,
      subject: typeof body?.subject === "string" ? body.subject : undefined,
      body: typeof body?.body === "string" ? body.body : undefined,
      variables: Array.isArray(body?.variables) ? body.variables : undefined,
      status,
    });
    return NextResponse.json(template);
  } catch (err) {
    return errorResponse(err);
  }
}
