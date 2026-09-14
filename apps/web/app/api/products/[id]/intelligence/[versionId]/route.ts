import { NextResponse } from "next/server";
import { editProductIntelligence, type GeneratedIntelligenceData } from "@rdv/domain";
import { ValidationError } from "@rdv/lib";
import { requireSession } from "../../../../../../lib/session";
import { errorResponse } from "../../../../../../lib/apiError";

export const dynamic = "force-dynamic";

const ARRAY_FIELDS = [
  "idealCustomer",
  "problems",
  "benefits",
  "niches",
  "subNiches",
  "creatorTypes",
  "countries",
  "languages",
  "topics",
  "keywords",
] as const;

/** Wave 2 Phase 2 (plan §7, §14.2): human edit of a draft version — never touches origin/status/approved_*, and editProductIntelligence itself refuses to edit a non-draft version. */
export async function PATCH(req: Request, { params }: { params: { id: string; versionId: string } }) {
  try {
    const actor = await requireSession();
    const body = await req.json().catch(() => ({}));

    const patch: Partial<GeneratedIntelligenceData> = {};
    for (const field of ARRAY_FIELDS) {
      const value = body?.[field];
      if (value !== undefined) {
        if (!Array.isArray(value) || !value.every((v: unknown) => typeof v === "string")) {
          throw new ValidationError(`${field} must be an array of strings`);
        }
        patch[field] = value;
      }
    }
    if (body?.audienceRationale !== undefined) {
      if (typeof body.audienceRationale !== "string") {
        throw new ValidationError("audienceRationale must be a string");
      }
      patch.audienceRationale = body.audienceRationale;
    }
    if (body?.confidence !== undefined) {
      if (typeof body.confidence !== "number") {
        throw new ValidationError("confidence must be a number");
      }
      patch.confidence = body.confidence;
    }

    const updated = await editProductIntelligence({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      intelligenceId: params.versionId,
      patch,
    });
    return NextResponse.json(updated);
  } catch (err) {
    return errorResponse(err);
  }
}
