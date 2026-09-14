import { NextResponse } from "next/server";
import { createProduct, listProducts } from "@rdv/domain";
import { ValidationError } from "@rdv/lib";
import { requireSession } from "../../../lib/session";
import { errorResponse } from "../../../lib/apiError";

export const dynamic = "force-dynamic";

/** Wave 2 Phase 2 (plan §7): Product CRUD — list/create. Any workspace member may list; creating requires Member-Operator (enforced inside createProduct). */
export async function GET() {
  try {
    const actor = await requireSession();
    const products = await listProducts({ workspaceId: actor.workspaceId, actorUserId: actor.userId });
    return NextResponse.json(products);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requireSession();
    const body = await req.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name : undefined;
    const description = typeof body?.description === "string" ? body.description : undefined;

    if (!name) {
      throw new ValidationError("name is required");
    }

    const product = await createProduct({
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      name,
      description,
    });
    return NextResponse.json(product, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
