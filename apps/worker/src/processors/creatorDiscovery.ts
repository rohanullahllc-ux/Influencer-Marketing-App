import { QUEUE_LANES } from "@rdv/queue";
import { searchYoutubeChannels, getYoutubeChannelStats, upsertDiscoveredCreators } from "@rdv/domain";
import type { DiscoveredChannel } from "@rdv/domain";
import { registerJobProcessor } from "../registry.js";

/**
 * Wave 2 Phase 3 (plan §8): the `creator-discovery` job — a narrow YouTube
 * search followed by a channel-stats lookup, then an upsert into
 * `creators`. Fails loudly (BullMQ retry/dead-letter) on any error,
 * including "no YouTube key configured", never silently retried forever
 * (plan §8 risks).
 */
export interface CreatorDiscoveryJobData {
  workspaceId: string;
  actorUserId: string;
  productId: string;
  query: string;
  maxResults: number;
}

registerJobProcessor<CreatorDiscoveryJobData, { creatorIds: string[]; count: number }>(
  QUEUE_LANES.creatorDiscovery,
  "youtube_discovery_search",
  async (data) => {
    const { workspaceId, query, maxResults } = data;

    const searchResults = await searchYoutubeChannels({ workspaceId, query, maxResults });
    const channelIds = searchResults.map((r) => r.channelId);
    const stats = await getYoutubeChannelStats({ workspaceId, channelIds });
    const statsById = new Map(stats.map((s) => [s.channelId, s]));

    const channels: DiscoveredChannel[] = searchResults.map((r) => {
      const s = statsById.get(r.channelId);
      return {
        channelId: r.channelId,
        title: s?.title || r.title,
        description: s?.description || r.description,
        country: s?.country ?? null,
        subscriberCount: s?.subscriberCount ?? null,
      };
    });

    const upserted = await upsertDiscoveredCreators({ workspaceId, channels });
    return { creatorIds: upserted.map((c) => c.id), count: upserted.length };
  }
);
