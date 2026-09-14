import { NextResponse } from "next/server";
import { consumeSetupToken } from "@rdv/auth";
import { ValidationError } from "@rdv/lib";
import { errorResponse } from "../../../lib/apiError";

export const dynamic = "force-dynamic";

/**
 * Unauthenticated by design — this IS how a member establishes their first
 * credential (plan §5). Safety comes entirely from the token itself
 * (single-use, hashed, time-limited — see @rdv/lib setupToken.ts), not
 * from a session, since none can exist yet for this user.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const token = typeof body?.token === "string" ? body.token : undefined;
    const password = typeof body?.password === "string" ? body.password : undefined;
    if (!token || !password) {
      throw new ValidationError("token and password are required");
    }

    const result = await consumeSetupToken({ token, newPassword: password });
    return NextResponse.json({ ok: true, userId: result.userId });
  } catch (err) {
    return errorResponse(err);
  }
}
