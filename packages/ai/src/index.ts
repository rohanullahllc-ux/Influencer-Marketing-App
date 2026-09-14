export {
  registerAiOperation,
  runAiOperation,
  listRegisteredAiOperations,
  AI_PROVENANCE,
  type AiOperationContext,
  type AiOperationResult,
} from "./orchestrator.js";
export { assertAllowedAiOperationName, FORBIDDEN_AI_OPERATION_SUBSTRINGS } from "./restrictions.js";

// Side-effecting import: registers the Wave 1 stub operation so
// `runAiOperation("stub_echo", ...)` works as soon as @rdv/ai is
// imported, the same way real operations will self-register in later
// waves (each operations/*.ts file registers itself on import).
import "./operations/stub.js";
// Wave 2 Phase 2: the first real product AI operation, registered the
// same way.
import "./operations/analyzeProduct.js";

export { getWorkspaceAnthropicClient } from "./client.js";
export type { AnalyzeProductInput, AnalyzeProductOutput } from "./operations/analyzeProduct.js";
