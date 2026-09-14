import { getDecryptedCredential } from "@rdv/auth";
import { ValidationError } from "@rdv/lib";

/**
 * Wave 2 Phase 3 (plan §8, §18): a narrow YouTube Data API v3 client —
 * search + channel-stats lookup only, no bulk-scrape fallback (plan §8
 * risks: quota exhaustion is handled by staying narrow, not by scraping).
 * Reads the decrypted per-workspace key via Phase 0's
 * getDecryptedCredential, never a bare env var, mirroring exactly how
 * packages/ai/src/client.ts reads the Anthropic key. Plain `fetch` is
 * used rather than a new SDK dependency — two REST endpoints don't
 * justify one.
 */
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

async function getWorkspaceYoutubeApiKey(workspaceId: string): Promise<string> {
  const apiKey = await getDecryptedCredential({ workspaceId, provider: "youtube" });
  if (!apiKey) {
    throw new ValidationError(
      "No YouTube API key configured for this workspace. Add one in Settings > Integrations before running creator discovery."
    );
  }
  return apiKey;
}

export interface YoutubeChannelSearchResult {
  channelId: string;
  title: string;
  description: string;
}

export async function searchYoutubeChannels(params: {
  workspaceId: string;
  query: string;
  maxResults: number;
}): Promise<YoutubeChannelSearchResult[]> {
  const { workspaceId, query, maxResults } = params;
  const apiKey = await getWorkspaceYoutubeApiKey(workspaceId);

  const url = new URL(`${YOUTUBE_API_BASE}/search`);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "channel");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`YouTube channel search failed (HTTP ${res.status}): ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    items?: { id?: { channelId?: string }; snippet?: { title?: string; description?: string } }[];
  };

  return (data.items ?? [])
    .filter((item): item is { id: { channelId: string }; snippet?: { title?: string; description?: string } } =>
      Boolean(item.id?.channelId)
    )
    .map((item) => ({
      channelId: item.id.channelId,
      title: item.snippet?.title ?? "",
      description: item.snippet?.description ?? "",
    }));
}

export interface YoutubeChannelStats {
  channelId: string;
  title: string;
  description: string;
  country: string | null;
  subscriberCount: number | null;
  viewCount: number | null;
  videoCount: number | null;
}

export async function getYoutubeChannelStats(params: {
  workspaceId: string;
  channelIds: string[];
}): Promise<YoutubeChannelStats[]> {
  const { workspaceId, channelIds } = params;
  if (channelIds.length === 0) return [];
  const apiKey = await getWorkspaceYoutubeApiKey(workspaceId);

  const url = new URL(`${YOUTUBE_API_BASE}/channels`);
  url.searchParams.set("part", "snippet,statistics");
  url.searchParams.set("id", channelIds.join(","));
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`YouTube channel stats lookup failed (HTTP ${res.status}): ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    items?: {
      id?: string;
      snippet?: { title?: string; description?: string; country?: string };
      statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string; hiddenSubscriberCount?: boolean };
    }[];
  };

  return (data.items ?? [])
    .filter((item): item is NonNullable<typeof item> & { id: string } => Boolean(item.id))
    .map((item) => ({
      channelId: item.id,
      title: item.snippet?.title ?? "",
      description: item.snippet?.description ?? "",
      country: item.snippet?.country ?? null,
      subscriberCount:
        item.statistics?.hiddenSubscriberCount || item.statistics?.subscriberCount === undefined
          ? null
          : Number(item.statistics.subscriberCount),
      viewCount: item.statistics?.viewCount === undefined ? null : Number(item.statistics.viewCount),
      videoCount: item.statistics?.videoCount === undefined ? null : Number(item.statistics.videoCount),
    }));
}
