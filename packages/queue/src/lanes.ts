/**
 * Named queue lanes (locked architectural decision — Step 4 decision #15,
 * reaffirmed and corrected in Step 5C/5D: each external dependency with
 * its own rate-limit profile gets its own lane, never a single shared
 * job queue). Adding a lane is a deliberate architectural change, not a
 * per-feature convenience — this list is the whole inventory on purpose.
 *
 * - creator-discovery: YouTube Data API calls (search, channel/video
 *   lookups) for finding and enriching creators. Rate-limited by
 *   YouTube's quota, independent of everything else.
 * - outreach-send: sending outbound messages via the outreach provider
 *   adapter. This lane is where the execution-time safety gate runs
 *   (see packages/domain once it exists) — it is the most sensitive lane
 *   in the system and must never share headroom with lower-stakes lanes.
 * - whop-sync: polling/syncing Whop for affiliate/membership state.
 * - webhook-ingest: processing inbound webhook events (reply-provider
 *   webhooks, Whop webhooks) — kept separate from creator-discovery/
 *   outreach-send so an inbound event spike can never starve or be
 *   starved by outbound work.
 * - ai-ops: calls into the centralized AI Orchestration module (see
 *   packages/ai). Isolated because AI provider latency/rate limits are
 *   unrelated to any of the above, and because keeping AI calls in their
 *   own lane makes it possible to pause/throttle AI usage independently
 *   (e.g. a cost control) without touching send or discovery pipelines.
 */
export const QUEUE_LANES = {
  creatorDiscovery: "creator-discovery",
  outreachSend: "outreach-send",
  whopSync: "whop-sync",
  webhookIngest: "webhook-ingest",
  aiOps: "ai-ops",
} as const;

export type QueueLaneName = (typeof QUEUE_LANES)[keyof typeof QUEUE_LANES];

export const ALL_QUEUE_LANES: QueueLaneName[] = Object.values(QUEUE_LANES);
