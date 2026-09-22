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
// Wave 2 Phase 5: creator-match explanation — a second, independent
// signal, never the final authority for qualification (see the
// operation's own doc comment).
import "./operations/explainCreatorMatch.js";
// Wave 2 Phase 6: outreach personalization — a draft only; approval is a
// separate, mandatory human action (see the operation's own doc comment).
import "./operations/personalizeOutreach.js";
// Wave 3: reply classification into exactly the three product-vision
// categories, and a suggested-response draft — AI classifies/drafts,
// never sends (see each operation's own doc comment).
import "./operations/classifyReply.js";
import "./operations/draftReplyResponse.js";

export { getWorkspaceAnthropicClient } from "./client.js";
export type { AnalyzeProductInput, AnalyzeProductOutput } from "./operations/analyzeProduct.js";
export type { ExplainCreatorMatchInput, ExplainCreatorMatchOutput } from "./operations/explainCreatorMatch.js";
export type { PersonalizeOutreachInput, PersonalizeOutreachOutput } from "./operations/personalizeOutreach.js";
export type { ClassifyReplyInput, ClassifyReplyOutput } from "./operations/classifyReply.js";
export type { DraftReplyResponseInput, DraftReplyResponseOutput } from "./operations/draftReplyResponse.js";
