import OpenAI from "openai";
import type { z } from "zod";
import { getDecryptedCredential } from "@rdv/auth";
import { ValidationError } from "@rdv/lib";

/**
 * DeepSeek's API is OpenAI-compatible (same Chat Completions request/
 * response shape), reached by pointing the official `openai` SDK at
 * DeepSeek's base URL instead of OpenAI's. `deepseek-chat` is DeepSeek's
 * general-purpose model, matching the structured, short-form tasks every
 * operation in this package performs.
 */
const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";
const DEEPSEEK_MODEL = "deepseek-chat";

/**
 * Reads the decrypted per-workspace key via Phase 0's credential-reader
 * helper (`getDecryptedCredential`) — never a bare env var for this key.
 * Real AI calls simply cannot execute until a workspace Owner/Admin pastes
 * a working DeepSeek key into Settings > Integrations — that is a data
 * prerequisite, not a code blocker.
 */
export async function getWorkspaceDeepSeekClient(workspaceId: string): Promise<OpenAI> {
  const apiKey = await getDecryptedCredential({ workspaceId, provider: "deepseek" });
  if (!apiKey) {
    throw new ValidationError(
      "No DeepSeek API key configured for this workspace. Add one in Settings > Integrations before generating AI content."
    );
  }
  return new OpenAI({ apiKey, baseURL: DEEPSEEK_BASE_URL });
}

/**
 * Shared call path for every operation in this package: get the
 * workspace's DeepSeek client, request JSON output (DeepSeek's
 * OpenAI-compatible `response_format: { type: "json_object" }` mode —
 * requires the word "json" to appear in the prompt, which every
 * operation's system prompt already does), then validate the result
 * against that operation's own Zod schema. A response that isn't valid
 * JSON, or doesn't match the schema, fails loudly here rather than
 * partially saving — the same failure philosophy the previous
 * Anthropic-backed implementation used, just centralized once instead of
 * repeated per operation (DeepSeek's compatibility layer has no
 * equivalent of Anthropic SDK's `messages.parse` + Zod-schema helper, so
 * this is the replacement for that).
 */
export async function runDeepSeekJsonCompletion<T>(params: {
  workspaceId: string;
  operationName: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  maxTokens: number;
}): Promise<T> {
  const { workspaceId, operationName, system, user, schema, maxTokens } = params;
  const client = await getWorkspaceDeepSeekClient(workspaceId);

  const completion = await client.chat.completions.create({
    model: DEEPSEEK_MODEL,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new ValidationError(`${operationName}: DeepSeek returned no content`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ValidationError(
      `${operationName}: DeepSeek's response was not valid JSON — failing rather than partially saving`
    );
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new ValidationError(
      `${operationName}: DeepSeek's response did not match the required output schema — failing rather than partially saving`
    );
  }

  return result.data;
}
