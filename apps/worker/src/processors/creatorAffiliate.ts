import { QUEUE_LANES } from "@rdv/queue";
import { executeAffiliateCreation } from "@rdv/domain";
import { registerJobProcessor } from "../registry.js";

/**
 * Wave 4 (Whop Affiliate/Conversion): the `whop_create_affiliate` job — a
 * thin wrapper, same shape as apps/worker/src/processors/outreachSend.ts.
 * All the real logic (idempotency, execution-time re-check, interruption
 * safety, provider call, attempt history, audit) lives in
 * packages/domain/src/creatorAffiliate.ts's executeAffiliateCreation.
 */
export interface CreatorAffiliateJobData {
  workspaceId: string;
  creatorAffiliateId: string;
}

registerJobProcessor<CreatorAffiliateJobData, { status: string }>(QUEUE_LANES.whopSync, "whop_create_affiliate", async (data) => {
  return executeAffiliateCreation({ workspaceId: data.workspaceId, creatorAffiliateId: data.creatorAffiliateId });
});
