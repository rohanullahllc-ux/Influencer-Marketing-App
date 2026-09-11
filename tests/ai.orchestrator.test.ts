import { describe, it, expect } from "vitest";
import { runAiOperation, listRegisteredAiOperations, registerAiOperation, AI_PROVENANCE } from "@rdv/ai";
import { assertAllowedAiOperationName } from "@rdv/ai";

describe("AI Orchestration — stub contract", () => {
  it("the Wave 1 stub operation is registered on import", () => {
    expect(listRegisteredAiOperations()).toContain("stub_echo");
  });

  it("runs a registered operation and tags the result with AI provenance", async () => {
    const result = await runAiOperation<{ text: string }, { text: string; length: number }>("stub_echo", {
      text: "hello",
    });
    expect(result.provenance).toBe(AI_PROVENANCE);
    expect(result.operation).toBe("stub_echo");
    expect(result.data).toEqual({ text: "hello", length: 5 });
  });

  it("throws on an unregistered operation name rather than silently no-op-ing", async () => {
    await expect(runAiOperation("does_not_exist", {})).rejects.toThrow(/No AI operation registered/);
  });
});

describe("AI Orchestration — hard restrictions", () => {
  it.each(["sendOutreach", "approve_message", "createAffiliate", "auto_merge_creator", "activateCampaign"])(
    "refuses to even register an operation named %s",
    (forbiddenName) => {
      expect(() => assertAllowedAiOperationName(forbiddenName)).toThrow();
      expect(() => registerAiOperation(forbiddenName, async () => ({}))).toThrow();
    }
  );

  it("allows a legitimately-named business operation", () => {
    expect(() => assertAllowedAiOperationName("classify_creator_relevance")).not.toThrow();
  });
});
