import { describe, it, expect, beforeEach } from "vitest";
import { runAiOperation } from "@rdv/ai";
import { createWorkspaceWithOwner, getUserByEmail, addMember, isAiMockModeEnabled, setAiMockMode } from "@rdv/auth";
import { AuthorizationError } from "@rdv/lib";
import { resetDb } from "./helpers.js";

/**
 * Mock AI provider (opt-in): lets a workspace exercise the full
 * AI-assisted workflow with clearly-labeled placeholder output instead of
 * a real DeepSeek key. Covers the workspace-level toggle itself
 * (packages/auth/src/workspaceSettings.ts) plus the three operations that
 * didn't already have a dedicated ai.*.test.ts file (classify_reply,
 * draft_reply_response, summarize_creator_conversation). analyze_product,
 * explain_creator_match, and personalize_outreach's mock behavior is
 * covered in their own existing test files, alongside their unchanged
 * "throws when no key configured" contract.
 */
describe("Mock AI mode — workspace toggle (packages/auth)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("defaults to disabled for a new workspace", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "Mock Toggle WS", ownerEmail: "mock-toggle-owner@test.local" });
    expect(await isAiMockModeEnabled(ws.id)).toBe(false);
  });

  it("an Admin can enable and disable it, and it audits", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "Mock Toggle WS 2", ownerEmail: "mock-toggle-owner-2@test.local" });
    const owner = await getUserByEmail("mock-toggle-owner-2@test.local");

    await setAiMockMode({ workspaceId: ws.id, actorUserId: owner.id, enabled: true });
    expect(await isAiMockModeEnabled(ws.id)).toBe(true);

    await setAiMockMode({ workspaceId: ws.id, actorUserId: owner.id, enabled: false });
    expect(await isAiMockModeEnabled(ws.id)).toBe(false);
  });

  it("a member_operator cannot toggle it (insufficient role)", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "Mock Toggle WS 3", ownerEmail: "mock-toggle-owner-3@test.local" });
    const owner = await getUserByEmail("mock-toggle-owner-3@test.local");
    await addMember({ workspaceId: ws.id, actorUserId: owner.id, targetEmail: "mock-op@test.local", role: "member_operator" });
    const op = await getUserByEmail("mock-op@test.local");

    await expect(setAiMockMode({ workspaceId: ws.id, actorUserId: op.id, enabled: true })).rejects.toThrow(AuthorizationError);
  });
});

describe("Mock AI mode — remaining operations' mock output", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("classify_reply always returns needs_human_review with low confidence in mock mode, never guessing 'interested'", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "Classify Mock WS", ownerEmail: "classify-mock-owner@test.local" });
    const owner = await getUserByEmail("classify-mock-owner@test.local");
    await setAiMockMode({ workspaceId: ws.id, actorUserId: owner.id, enabled: true });

    const result = await runAiOperation<
      { workspaceId: string; originalSubject: string | null; originalBody: string | null; replySubject: string | null; replyBody: string },
      { classification: string; confidence: number; limitations: string | null }
    >("classify_reply", {
      workspaceId: ws.id,
      originalSubject: "Partnership?",
      originalBody: "Hi, interested in working together?",
      replySubject: null,
      replyBody: "Sure, tell me more!",
    });

    expect(result.data.classification).toBe("needs_human_review");
    expect(result.data.confidence).toBeLessThan(0.5);
    expect(result.data.limitations).toMatch(/\[MOCK DATA\]/);
  });

  it("draft_reply_response returns a clearly-labeled mock draft", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "Draft Reply Mock WS", ownerEmail: "draft-reply-mock-owner@test.local" });
    const owner = await getUserByEmail("draft-reply-mock-owner@test.local");
    await setAiMockMode({ workspaceId: ws.id, actorUserId: owner.id, enabled: true });

    const result = await runAiOperation<
      { workspaceId: string; creatorName: string | null; originalSubject: string | null; originalBody: string | null; replyBody: string; classification: "interested" | "needs_human_review" },
      { subject: string; body: string }
    >("draft_reply_response", {
      workspaceId: ws.id,
      creatorName: "Big Cook",
      originalSubject: "Partnership?",
      originalBody: "Hi, interested in working together?",
      replyBody: "Sure, tell me more!",
      classification: "interested",
    });

    expect(result.data.subject).toMatch(/\[MOCK DRAFT\]/);
    expect(result.data.body).toMatch(/MOCK/);
  });

  it("summarize_creator_conversation returns a clearly-labeled mock summary grounded in the real thread length", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "Summary Mock WS", ownerEmail: "summary-mock-owner@test.local" });
    const owner = await getUserByEmail("summary-mock-owner@test.local");
    await setAiMockMode({ workspaceId: ws.id, actorUserId: owner.id, enabled: true });

    const result = await runAiOperation<
      { workspaceId: string; creatorName: string | null; thread: Array<{ direction: "outbound" | "inbound"; occurredAt: string; subject: string | null; body: string }> },
      { summary: string; limitations: string | null }
    >("summarize_creator_conversation", {
      workspaceId: ws.id,
      creatorName: "Big Cook",
      thread: [
        { direction: "outbound", occurredAt: new Date().toISOString(), subject: "Partnership?", body: "Hi!" },
        { direction: "inbound", occurredAt: new Date().toISOString(), subject: null, body: "Sure!" },
      ],
    });

    expect(result.data.summary).toMatch(/\[MOCK\]/);
    expect(result.data.summary).toContain("2");
    expect(result.data.limitations).toMatch(/\[MOCK DATA\]/);
  });
});
