import { describe, it, expect, beforeEach } from "vitest";
import { runAiOperation, listRegisteredAiOperations, assertAllowedAiOperationName } from "@rdv/ai";
import { createWorkspaceWithOwner } from "@rdv/auth";
import { resetDb } from "./helpers.js";

/**
 * Wave 2 Phase 5 (plan §10, §18): the `explain_creator_match` AI
 * operation's contract — registered on import, passes the Wave 1 hard-
 * restriction check, and correctly refuses to run (loudly, not silently)
 * when no Anthropic credential is configured, exactly like Phase 2's
 * analyze_product. No network call to Anthropic is made or mocked.
 */
describe("AI Orchestration — explain_creator_match (Wave 2 Phase 5)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("is registered on import", () => {
    expect(listRegisteredAiOperations()).toContain("explain_creator_match");
  });

  it("passes the Wave 1 hard-restriction check", () => {
    expect(() => assertAllowedAiOperationName("explain_creator_match")).not.toThrow();
  });

  it("throws a clear, actionable error when the workspace has no Anthropic key configured", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "Match AI WS", ownerEmail: "match-ai-owner@test.local" });

    await expect(
      runAiOperation("explain_creator_match", {
        workspaceId: ws.id,
        campaignObjective: "Drive trial",
        campaignNiches: ["cooking"],
        productName: "Meal Kit Co",
        productAudienceRationale: null,
        creatorName: "Big Cook",
        creatorNiche: "cooking",
        creatorSubNiche: null,
        creatorSubscriberCount: 5000,
        creatorCountry: "US",
      })
    ).rejects.toThrow(/No Anthropic API key configured/);
  });

  it("rejects a missing creatorName before ever reaching the credential lookup", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "Match AI WS 2", ownerEmail: "match-ai-owner-2@test.local" });

    await expect(
      runAiOperation("explain_creator_match", {
        workspaceId: ws.id,
        campaignObjective: null,
        campaignNiches: [],
        productName: "X",
        productAudienceRationale: null,
        creatorName: "",
        creatorNiche: null,
        creatorSubNiche: null,
        creatorSubscriberCount: null,
        creatorCountry: null,
      })
    ).rejects.toThrow(/creatorName is required/);
  });
});
