import { getLogger } from "@rdv/lib";
import { assertAllowedAiOperationName } from "./restrictions.js";

const log = getLogger({ module: "ai:orchestrator" });

/**
 * Every AI Orchestration result is tagged with this provenance marker
 * (Step 6 data-provenance rule: AI-derived data is a distinct category
 * from verified/external or human-entered data, and must never silently
 * overwrite verified data — enforcement of *that* rule lives in whatever
 * domain code writes an AI result to a record, not here; this module's
 * job is only to make sure the tag is never lost or spoofable by a
 * handler).
 */
export const AI_PROVENANCE = "ai-derived" as const;

export interface AiOperationContext {
  workspaceId?: string;
  actorUserId?: string;
}

export interface AiOperationResult<TOutput> {
  operation: string;
  provenance: typeof AI_PROVENANCE;
  data: TOutput;
}

type AiOperationHandler<TInput, TOutput> = (input: TInput, context: AiOperationContext) => Promise<TOutput>;

const registry = new Map<string, AiOperationHandler<unknown, unknown>>();

/**
 * Registers a named AI operation. This is the ONLY way an operation
 * becomes callable via `runAiOperation` — there is no dynamic/free-form
 * "call any prompt" entry point, by design (Step 6: AI Orchestration is
 * business-operation-oriented, not a generic multi-purpose AI gateway).
 * Throws at registration time (i.e. at module load, not at call time) if
 * the name matches a forbidden action pattern.
 */
export function registerAiOperation<TInput, TOutput>(
  name: string,
  handler: AiOperationHandler<TInput, TOutput>
): void {
  assertAllowedAiOperationName(name);
  if (registry.has(name)) {
    throw new Error(`AI operation "${name}" is already registered`);
  }
  registry.set(name, handler as AiOperationHandler<unknown, unknown>);
}

/** Runs a registered AI operation, tagging the result with AI provenance. */
export async function runAiOperation<TInput = unknown, TOutput = unknown>(
  name: string,
  input: TInput,
  context: AiOperationContext = {}
): Promise<AiOperationResult<TOutput>> {
  const handler = registry.get(name);
  if (!handler) {
    throw new Error(`No AI operation registered with name "${name}"`);
  }

  log.info({ operation: name, workspaceId: context.workspaceId }, "running AI operation");
  const data = (await handler(input, context)) as TOutput;

  return { operation: name, provenance: AI_PROVENANCE, data };
}

export function listRegisteredAiOperations(): string[] {
  return [...registry.keys()];
}

/** Test/dev-only: clears the registry. Never call from application code. */
export function __resetRegistryForTests(): void {
  registry.clear();
}
