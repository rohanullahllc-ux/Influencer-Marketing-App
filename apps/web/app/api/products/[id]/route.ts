import { NextResponse } from "next/server";
import { getProduct, updateProduct } from "@rdv/domain";
import { ValidationError } from "@rdv/lib";
import { requireSession } from "../../../../lib/session";
import { errorResponse } from "../../../../lib/apiError";

export const dynamic = "force-dynamic";

const VALID_STATUSES = ["draft", "active", "archived"] as const;
type ProductStatus = (typeof VALID_STATUSES)[number];

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSession();
    const product = await getProduct({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      productId: params.id,
    });
    return NextResponse.json(product);
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

    const product = await updateProduct({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      productId: params.id,
      name: typeof body?.name === "string" ? body.name : undefined,
      description: typeof body?.description === "string" ? body.description : undefined,
      status: status as ProductStatus | undefined,
    });
    return NextResponse.json(product);
  } catch (err) {
    return errorResponse(err);
  }
}
