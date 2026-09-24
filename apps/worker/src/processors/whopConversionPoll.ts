import { QUEUE_LANES } from "@rdv/queue";
import { pollWhopConversions } from "@rdv/domain";
import { registerJobProcessor } from "../registry.js";

/**
 * Wave 4: the Whop polling/reconciliation architecture named in the
 * product vision ("polling-based conversion tracking"). Runs on
 * `whop-sync`, the dedicated lane for Whop polling/sync work (see
 * packages/queue/src/lanes.ts). Unlike replyReconciliationPoll.ts (a pure
 * backstop behind webhook-primary delivery), Whop conversions in V1 are
 * polling-only by design — there is no Whop webhook subscription in this
 * codebase yet, so this job is the actual primary path, not a backstop.
 * Against the Mock provider it genuinely walks every real `active`
 * affiliate and calls the provider abstraction for real (returning zero
 * records honestly, never fabricated) — a real Whop adapter only has to
 * implement `getConversions` for this whole pipeline to start ingesting
 * real conversions.
 */
export interface WhopConversionPollJobData {
  workspaceId: string;
}

registerJobProcessor<WhopConversionPollJobData, { affiliatesPolled: number; newConversions: number }>(
  QUEUE_LANES.whopSync,
  "whop_conversion_poll",
  async (data) => {
    return pollWhopConversions({ workspaceId: data.workspaceId });
  }
);
