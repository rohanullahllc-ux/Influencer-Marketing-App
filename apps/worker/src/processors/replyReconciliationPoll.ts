import { QUEUE_LANES } from "@rdv/queue";
import { recordMailboxSync } from "@rdv/domain";
import { registerJobProcessor } from "../registry.js";

/**
 * Wave 3: the reconciliation-polling backstop named in the product vision
 * ("webhook-primary with reconciliation polling as backstop"). Runs on
 * `webhook-ingest`, deliberately separate from `ai-ops`/`outreach-send` so
 * an inbound event spike never starves outbound work. Against the Mock
 * provider there is no real mailbox to poll — this job's job is to prove
 * the scaffolding (provider_mailbox_state bookkeeping, the queue lane,
 * the job contract) is correct now, so a real provider's adapter only has
 * to plug in the actual "fetch messages since syncCursor" call. It is
 * never the only path a reply can arrive by (webhooks are primary);
 * losing/missing a webhook delivery is exactly the gap this backstop
 * exists to catch once a real provider is wired in.
 */
export interface ReplyReconciliationPollJobData {
  workspaceId: string;
  provider: string;
}

registerJobProcessor<ReplyReconciliationPollJobData, { polled: true }>(
  QUEUE_LANES.webhookIngest,
  "reply_reconciliation_poll",
  async (data) => {
    const { workspaceId, provider } = data;
    // A real adapter would: read the stored syncCursor, fetch messages the
    // provider reports since that cursor, call ingestInboundMessage for
    // each (which already dedupes safely against a webhook having also
    // delivered the same message), then advance the cursor. The Mock
    // provider has nothing to fetch, so this call only proves the
    // bookkeeping half works for real.
    await recordMailboxSync({ workspaceId, provider });
    return { polled: true };
  }
);
