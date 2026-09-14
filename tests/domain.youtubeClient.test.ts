import { describe, it, expect, beforeEach } from "vitest";
import { searchYoutubeChannels, getYoutubeChannelStats } from "@rdv/domain";
import { createWorkspaceWithOwner } from "@rdv/auth";
import { resetDb } from "./helpers.js";

/**
 * Wave 2 Phase 3 (plan §8, §18): the YouTube client's credential-lookup
 * failure path — no live YouTube key exists in this environment, so
 * both real DB-backed lookups are expected to fail loudly before any
 * network call, the same pattern as Phase 2's Anthropic credential test.
 */
describe("YouTube client — credential lookup (Wave 2 Phase 3)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("searchYoutubeChannels throws a clear, actionable error with no configured key", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "YT WS", ownerEmail: "yt-owner@test.local" });

    await expect(
      searchYoutubeChannels({ workspaceId: ws.id, query: "cooking", maxResults: 5 })
    ).rejects.toThrow(/No YouTube API key configured/);
  });

  it("getYoutubeChannelStats throws the same clear error with no configured key", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "YT WS 2", ownerEmail: "yt-owner-2@test.local" });

    await expect(
      getYoutubeChannelStats({ workspaceId: ws.id, channelIds: ["UC_fake"] })
    ).rejects.toThrow(/No YouTube API key configured/);
  });

  it("getYoutubeChannelStats returns an empty array for an empty channelIds list without a credential lookup", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "YT WS 3", ownerEmail: "yt-owner-3@test.local" });
    const result = await getYoutubeChannelStats({ workspaceId: ws.id, channelIds: [] });
    expect(result).toEqual([]);
  });
});
