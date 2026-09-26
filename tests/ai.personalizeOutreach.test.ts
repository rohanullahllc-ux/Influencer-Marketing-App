import { describe, it, expect, beforeEach } from "vitest";
import { runAiOperation, listRegisteredAiOperations, assertAllowedAiOperationName } from "@rdv/ai";
import { createWorkspaceWithOwner, getUserByEmail, setAiMockMode } from "@rdv/auth";
import { resetDb } from "./helpers.js";

/**
 * Wave 2 Phase 6 (plan §11, §18): the `personalize_outreach` AI
 * operation's contract — registered on import, passes the Wave 1 hard-
 * restriction check (never "send"/"approve"), and correctly refuses to
 * run without a configured DeepSeek key.
 */
describe("AI Orchestration — personalize_outreach (Wave 2 Phase 6)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("is registered on import", () => {
    expect(listRegisteredAiOperations()).toContain("personalize_outreach");
  });

  it("passes the Wave 1 hard-restriction check", () => {
    expect(() => assertAllowedAiOperationName("personalize_outreach")).not.toThrow();
  });

  it("throws a clear, actionable error when the workspace has no DeepSeek key configured", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "Draft AI WS", ownerEmail: "draft-ai-owner@test.local" });

    await expect(
      runAiOperation("personalize_outreach", {
        workspaceId: ws.id,
        productName: "Meal Kit Co",
        productAudienceRationale: null,
        campaignObjective: "Drive trial",
        creatorName: "Big Cook",
        creatorNiche: "cooking",
        templateSubject: null,
        templateBody: null,
      })
    ).rejects.toThrow(/No DeepSeek API key configured/);
  });

  it("rejects a missing creatorName before ever reaching the credential lookup", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "Draft AI WS 2", ownerEmail: "draft-ai-owner-2@test.local" });

    await expect(
      runAiOperation("personalize_outreach", {
        workspaceId: ws.id,
        productName: "X",
        productAudienceRationale: null,
        campaignObjective: null,
        creatorName: "",
        creatorNiche: null,
        templateSubject: null,
        templateBody: null,
      })
    ).rejects.toThrow(/creatorName is required/);
  });

  it("returns a clearly-labeled mock draft instead of throwing when Mock AI mode is enabled", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "Draft AI WS Mock", ownerEmail: "draft-ai-owner-mock@test.local" });
    const owner = await getUserByEmail("draft-ai-owner-mock@test.local");
    await setAiMockMode({ workspaceId: ws.id, actorUserId: owner.id, enabled: true });

    const result = await runAiOperation<
      { workspaceId: string; productName: string; productAudienceRationale: string | null; campaignObjective: string | null; creatorName: string; creatorNiche: string | null; templateSubject: string | null; templateBody: string | null },
      { subject: string; body: string }
    >("personalize_outreach", {
      workspaceId: ws.id,
      productName: "Meal Kit Co",
      productAudienceRationale: null,
      campaignObjective: "Drive trial",
      creatorName: "Big Cook",
      creatorNiche: "cooking",
      templateSubject: null,
      templateBody: null,
    });

    expect(result.data.subject).toMatch(/\[MOCK DRAFT\]/);
    expect(result.data.body).toMatch(/MOCK/);
  });
});
