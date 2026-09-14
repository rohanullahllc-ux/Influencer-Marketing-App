import { NextResponse } from "next/server";
import { requestCreatorDiscovery } from "@rdv/domain";
import { ValidationError } from "@rdv/lib";
import { requireSession } from "../../../../../lib/session";
import { errorResponse } from "../../../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Wave 2 Phase 3 (plan §8): enqueues a narrow YouTube discovery search against this product's approved Product Intelligence; returns a run id (the BullMQ job id) to poll. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const body = await req.json().catch(() => ({}));
    const query = typeof body?.query === "string" ? body.query : undefined;
    const maxResults = typeof body?.maxResults === "number" ? body.maxResults : undefined;

    if (!query) {
      throw new ValidationError("query is required");
    }

    const result = await requestCreatorDiscovery({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      productId: params.id,
      query,
      maxResults,
    });
    return NextResponse.json(result, { status: 202 });
  } catch (err) {
    return errorResponse(err);
  }
}
