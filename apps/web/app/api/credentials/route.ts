import { NextResponse } from "next/server";
import { storeCredential, getCredentialStatus, type CredentialProvider } from "@rdv/auth";
import { ValidationError } from "@rdv/lib";
import { requireSession } from "../../../lib/session";
import { errorResponse } from "../../../lib/apiError";

export const dynamic = "force-dynamic";

const VALID_PROVIDERS: CredentialProvider[] = ["youtube", "outreach_provider", "whop", "anthropic"];

/** Owner/Admin-only. Neither method ever returns or accepts a raw key on GET, and POST's key never persists in plaintext (plan §4B, §5). */
export async function GET() {
  try {
    const actor = await requireSession();
    const statuses = await getCredentialStatus({ workspaceId: actor.workspaceId, actorUserId: actor.userId });
    return NextResponse.json(statuses);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requireSession();
    const body = await req.json().catch(() => null);
    const provider = body?.provider as CredentialProvider | undefined;
    const apiKey = typeof body?.apiKey === "string" ? body.apiKey : undefined;

    if (!provider || !VALID_PROVIDERS.includes(provider)) {
      throw new ValidationError(`provider must be one of: ${VALID_PROVIDERS.join(", ")}`);
    }
    if (!apiKey) {
      throw new ValidationError("apiKey is required");
    }

    await storeCredential({ workspaceId: actor.workspaceId, actorUserId: actor.userId, provider, apiKey });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
