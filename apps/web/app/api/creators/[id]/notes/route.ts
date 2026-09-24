import { NextResponse } from "next/server";
import { addCreatorNote, listCreatorNotes } from "@rdv/domain";
import { ValidationError } from "@rdv/lib";
import { requireSession } from "../../../../../lib/session";
import { errorResponse } from "../../../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Wave 4 (Creator CRM): append-only notes on a creator. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const notes = await listCreatorNotes({ workspaceId: actor.workspaceId, actorUserId: actor.userId, creatorId: params.id });
    return NextResponse.json(notes);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const body = await req.json().catch(() => null);
    const noteBody = typeof body?.body === "string" ? body.body : undefined;
    if (!noteBody) throw new ValidationError("body is required");

    const note = await addCreatorNote({ workspaceId: actor.workspaceId, actorUserId: actor.userId, creatorId: params.id, body: noteBody });
    return NextResponse.json(note, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
