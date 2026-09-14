import { NextResponse } from "next/server";
import { createTemplate, listTemplates } from "@rdv/domain";
import { ValidationError } from "@rdv/lib";
import { requireSession } from "../../../lib/session";
import { errorResponse } from "../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Wave 2 Phase 4 (plan §9): Outreach Template CRUD — list/create. */
export async function GET() {
  try {
    const actor = await requireSession();
    const templates = await listTemplates({ workspaceId: actor.workspaceId, actorUserId: actor.userId });
    return NextResponse.json(templates);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requireSession();
    const body = await req.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name : undefined;
    if (!name) throw new ValidationError("name is required");

    const template = await createTemplate({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      name,
      subject: typeof body?.subject === "string" ? body.subject : undefined,
      body: typeof body?.body === "string" ? body.body : undefined,
      variables: Array.isArray(body?.variables) ? body.variables : undefined,
    });
    return NextResponse.json(template, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
