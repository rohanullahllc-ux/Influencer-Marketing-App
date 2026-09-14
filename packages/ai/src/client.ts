import Anthropic from "@anthropic-ai/sdk";
import { getDecryptedCredential } from "@rdv/auth";
import { ValidationError } from "@rdv/lib";

/**
 * Wave 2 Phase 2 (plan §18): wraps the Anthropic SDK, reading the
 * decrypted per-workspace key via Phase 0's credential-reader helper
 * (`getDecryptedCredential`, whose own doc comment already anticipated
 * this exact caller) — never a bare env var for this key. Env vars remain
 * correct for infra values like DATABASE_URL/CREDENTIALS_MASTER_KEY,
 * unchanged from Wave 1/Phase 0.
 *
 * Real AI calls simply cannot execute until a workspace Owner/Admin
 * pastes a working Anthropic key into Settings > Integrations — that is
 * a data prerequisite, not a code blocker, exactly as Phase 0 designed
 * credential storage to work.
 */
export async function getWorkspaceAnthropicClient(workspaceId: string): Promise<Anthropic> {
  const apiKey = await getDecryptedCredential({ workspaceId, provider: "anthropic" });
  if (!apiKey) {
    throw new ValidationError(
      "No Anthropic API key configured for this workspace. Add one in Settings > Integrations before generating AI content."
    );
  }
  return new Anthropic({ apiKey });
}
