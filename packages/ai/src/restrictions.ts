import { AuthorizationError } from "@rdv/lib";

/**
 * Hard AI restrictions (Step 6, non-negotiable): AI may never — under any
 * operation name, in any wave — perform these actions. This list exists
 * so an operation with one of these names can never even be *registered*
 * with the orchestrator (see orchestrator.ts's `registerAiOperation`),
 * not merely "discouraged by convention." Business logic that actually
 * sends, approves, creates affiliates, merges creators, changes
 * permissions, disables suppression, or activates campaigns must call
 * those domain functions directly and must never route the decision
 * through the AI Orchestration module.
 */
export const FORBIDDEN_AI_OPERATION_SUBSTRINGS = [
  "send",
  "approve",
  "createaffiliate",
  "automerge",
  "merge_creator",
  "modifypermission",
  "disablesuppression",
  "activatecampaign",
] as const;

export function assertAllowedAiOperationName(name: string): void {
  const normalized = name.toLowerCase().replace(/[^a-z]/g, "");
  const hit = FORBIDDEN_AI_OPERATION_SUBSTRINGS.find((forbidden) => normalized.includes(forbidden));
  if (hit) {
    throw new AuthorizationError(
      `AI operation name "${name}" matches forbidden pattern "${hit}" — the AI Orchestration module may never send, approve, merge, or activate anything (see Step 6 AI restrictions). This is a code-time error: rename the operation or, more likely, this logic does not belong in @rdv/ai at all.`
    );
  }
}
