import { QUEUE_LANES } from "@rdv/queue";
import { performDryRunEvaluation } from "@rdv/domain";
import { registerJobProcessor } from "../registry.js";

/**
 * Wave 2 Phase 7 (plan §12): the `dry_run_evaluate` job — runs the
 * deterministic safety gate over every shortlisted creator on a
 * campaign. Runs on the `outreach-send` lane, per Wave 1's own reserved-
 * for-the-safety-gate comment in packages/queue/src/lanes.ts. Never
 * imports or calls a provider adapter — none exists anywhere in this
 * codebase to call, so there is no possible path to a real outbound send
 * here even by mistake.
 */
export interface DryRunJobData {
  workspaceId: string;
  actorUserId: string;
  campaignId: string;
}

registerJobProcessor<DryRunJobData, { evaluationId: string; eligibleCount: number; blockedCount: number }>(
  QUEUE_LANES.outreachSend,
  "dry_run_evaluate",
  async (data) => {
    const { workspaceId, actorUserId, campaignId } = data;
    return performDryRunEvaluation({ workspaceId, actorUserId, campaignId });
  }
);
