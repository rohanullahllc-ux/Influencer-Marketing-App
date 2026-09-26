import { describe, it, expect, beforeEach } from "vitest";
import { runAiOperation, listRegisteredAiOperations, assertAllowedAiOperationName } from "@rdv/ai";
import { createWorkspaceWithOwner, getUserByEmail, setAiMockMode } from "@rdv/auth";
import { resetDb } from "./helpers.js";

/**
 * Wave 2 Phase 2 (plan §7, §18): the `analyze_product` AI operation's
 * contract — registered on import, passes the Wave 1 hard-restriction
 * check, and correctly refuses to run (loudly, not silently) when no
 * Anthropic credential is configured for the workspace. This exercises
 * the real credential-lookup path against real local Postgres — no
 * network call to Anthropic is made or mocked, since none is reachable
 * in this environment without a real key (see Phase 0's credential
 * design: the code path is fully implemented whether or not a key
 * exists yet).
 */
describe("AI Orchestration — analyze_product (Wave 2 Phase 2)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("is registered on import", () => {
    expect(listRegisteredAiOperations()).toContain("analyze_product");
  });

  it("passes the Wave 1 hard-restriction check (does not match any forbidden pattern)", () => {
    expect(() => assertAllowedAiOperationName("analyze_product")).not.toThrow();
  });

  it("throws a clear, actionable error when the workspace has no Anthropic key configured", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "AI WS", ownerEmail: "ai-owner@test.local" });

    await expect(
      runAiOperation("analyze_product", {
        workspaceId: ws.id,
        productName: "Widget Pro",
        productDescription: "A widget.",
      })
    ).rejects.toThrow(/No Anthropic API key configured/);
  });

  it("rejects a missing productName before ever reaching the credential lookup", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "AI WS 2", ownerEmail: "ai-owner-2@test.local" });

    await expect(
      runAiOperation("analyze_product", { workspaceId: ws.id, productName: "", productDescription: null })
    ).rejects.toThrow(/productName is required/);
  });

  it("returns clearly-labeled mock output instead of throwing when Mock AI mode is enabled, with no key configured", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "AI WS Mock", ownerEmail: "ai-owner-mock@test.local" });
    const owner = await getUserByEmail("ai-owner-mock@test.local");
    await setAiMockMode({ workspaceId: ws.id, actorUserId: owner.id, enabled: true });

    const result = await runAiOperation<{ workspaceId: string; productName: string; productDescription: string | null }, { audienceRationale: string; confidence: number }>(
      "analyze_product",
      { workspaceId: ws.id, productName: "Widget Pro", productDescription: "A widget." }
    );

    expect(result.data.audienceRationale).toMatch(/\[MOCK/);
    expect(result.data.confidence).toBeLessThan(0.5);
  });
});
