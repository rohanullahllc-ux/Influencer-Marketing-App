import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  createProduct,
  createCampaign,
  updateCampaign,
  createManualCreator,
  shortlistCreator,
  persistOutreachDraft,
  createApprovalForDraft,
  decideApproval,
  scheduleSend,
  executeScheduledSend,
  ingestInboundMessage,
  normalizeFromIdentity,
  getInboundMessage,
  listInboundMessages,
  persistReplyClassification,
  requestReplyIntelligence,
  recordMailboxSync,
  getMailboxSyncState,
} from "@rdv/domain";
import { createWorkspaceWithOwner, getUserByEmail } from "@rdv/auth";
import { closeAllQueues, closeRedisConnection } from "@rdv/queue";
import { ValidationError, NotFoundError } from "@rdv/lib";
import { resetDb } from "./helpers.js";

describe("Reply Intelligence — ingestion, matching, dedupe (Wave 3)", () => {
  let wsId: string;
  let ownerId: string;
  let productId: string;
  let campaignId: string;

  beforeEach(async () => {
    await resetDb();
    const ws = await createWorkspaceWithOwner({ workspaceName: "Reply WS", ownerEmail: "reply-owner@test.local" });
    wsId = ws.id;
    ownerId = (await getUserByEmail("reply-owner@test.local")).id;
    const product = await createProduct({ workspaceId: wsId, actorUserId: ownerId, name: "Reply Product" });
    productId = product.id;
    const campaign = await createCampaign({ workspaceId: wsId, actorUserId: ownerId, input: { productId, name: "Reply Campaign" } });
    campaignId = campaign.id;
    await updateCampaign({ workspaceId: wsId, actorUserId: ownerId, campaignId, input: { status: "active" } });
  });

  afterAll(async () => {
    await closeAllQueues();
    await closeRedisConnection();
  });

  async function sentTo(name: string, email: string) {
    const creator = await createManualCreator({ workspaceId: wsId, actorUserId: ownerId, displayName: name, contactEmail: email });
    await shortlistCreator({ workspaceId: wsId, actorUserId: ownerId, campaignId, creatorId: creator.id });
    const draft = await persistOutreachDraft({ workspaceId: wsId, campaignId, creatorId: creator.id, templateId: null, subject: `Hi ${name}`, body: "Body", generationInput: {} });
    const approval = await createApprovalForDraft({ workspaceId: wsId, actorUserId: ownerId, draftId: draft.id });
    await decideApproval({ workspaceId: wsId, actorUserId: ownerId, approvalId: approval.id, decision: "approve" });
    const send = await scheduleSend({ workspaceId: wsId, actorUserId: ownerId, approvalId: approval.id });
    await executeScheduledSend({ workspaceId: wsId, outreachSendId: send.id });
    return creator;
  }

  it("normalizeFromIdentity extracts a bare address from a 'Name <addr>' header, and lowercases/trims either form", () => {
    expect(normalizeFromIdentity("Jane Doe <Jane@Example.com>")).toBe("jane@example.com");
    expect(normalizeFromIdentity("  jane@example.com  ")).toBe("jane@example.com");
  });

  it("rejects an empty body or fromIdentity", async () => {
    await expect(
      ingestInboundMessage({ workspaceId: wsId, provider: "mock", providerMessageId: "m1", fromIdentity: "a@example.com", body: "", receivedAt: new Date() })
    ).rejects.toThrow(ValidationError);
    await expect(
      ingestInboundMessage({ workspaceId: wsId, provider: "mock", providerMessageId: "m2", fromIdentity: "", body: "hi", receivedAt: new Date() })
    ).rejects.toThrow(ValidationError);
  });

  it("matches a reply to the correct creator + campaign + outreach send, once that creator has a real sent message", async () => {
    const creator = await sentTo("Cook", "cook@example.com");
    const { message } = await ingestInboundMessage({
      workspaceId: wsId,
      provider: "mock",
      providerMessageId: "msg-1",
      fromIdentity: "Cook <cook@example.com>",
      body: "Sounds great, let's talk rates.",
      receivedAt: new Date(),
    });

    expect(message.matchStatus).toBe("matched");
    expect(message.creatorId).toBe(creator.id);
    expect(message.campaignId).toBe(campaignId);
    expect(message.outreachSendId).not.toBeNull();
  });

  it("marks a reply from a completely unknown address as unknown", async () => {
    const { message } = await ingestInboundMessage({
      workspaceId: wsId,
      provider: "mock",
      providerMessageId: "msg-2",
      fromIdentity: "stranger@example.com",
      body: "Who is this?",
      receivedAt: new Date(),
    });
    expect(message.matchStatus).toBe("unknown");
    expect(message.creatorId).toBeNull();
  });

  it("marks a reply as ambiguous when the creator is known but has no prior real sent message", async () => {
    // Creator exists with this contact email, but no send has ever gone out to them.
    await createManualCreator({ workspaceId: wsId, actorUserId: ownerId, displayName: "Never Sent To", contactEmail: "never@example.com" });
    const { message } = await ingestInboundMessage({
      workspaceId: wsId,
      provider: "mock",
      providerMessageId: "msg-3",
      fromIdentity: "never@example.com",
      body: "Random reply",
      receivedAt: new Date(),
    });
    expect(message.matchStatus).toBe("ambiguous");
    expect(message.creatorId).not.toBeNull();
    expect(message.campaignId).toBeNull();
  });

  it("marks a reply as ambiguous when multiple creator records share the same contact email", async () => {
    await createManualCreator({ workspaceId: wsId, actorUserId: ownerId, displayName: "Dup One", contactEmail: "dup@example.com" });
    await createManualCreator({ workspaceId: wsId, actorUserId: ownerId, displayName: "Dup Two", contactEmail: "dup@example.com" });
    const { message } = await ingestInboundMessage({
      workspaceId: wsId,
      provider: "mock",
      providerMessageId: "msg-4",
      fromIdentity: "dup@example.com",
      body: "Which one am I?",
      receivedAt: new Date(),
    });
    expect(message.matchStatus).toBe("ambiguous");
    expect(message.creatorId).toBeNull();
  });

  it("dedupes a replayed/duplicate webhook delivery of the same provider message — true no-op, no re-matching", async () => {
    const first = await ingestInboundMessage({
      workspaceId: wsId,
      provider: "mock",
      providerMessageId: "dup-msg",
      fromIdentity: "someone@example.com",
      body: "First delivery",
      receivedAt: new Date(),
    });
    expect(first.wasNew).toBe(true);

    const replay = await ingestInboundMessage({
      workspaceId: wsId,
      provider: "mock",
      providerMessageId: "dup-msg",
      fromIdentity: "someone@example.com",
      body: "This body would be ignored if it were re-processed",
      receivedAt: new Date(),
    });
    expect(replay.wasNew).toBe(false);
    expect(replay.message.id).toBe(first.message.id);
    expect(replay.message.body).toBe("First delivery"); // untouched by the "replay"

    const all = await listInboundMessages({ workspaceId: wsId, actorUserId: ownerId });
    expect(all).toHaveLength(1);
  });

  it("out-of-order / malformed events: a message with a future receivedAt or odd payload still ingests safely", async () => {
    const future = new Date(Date.now() + 60_000);
    const { message } = await ingestInboundMessage({
      workspaceId: wsId,
      provider: "mock",
      providerMessageId: "future-msg",
      fromIdentity: "someone@example.com",
      body: "From the future",
      receivedAt: future,
      rawPayload: { weird: { nested: [1, 2, 3] }, notes: null },
    });
    expect(message.receivedAt.getTime()).toBe(future.getTime());
  });

  it("requestReplyIntelligence rejects an unknown inbound message id", async () => {
    await expect(
      requestReplyIntelligence({ workspaceId: wsId, actorUserId: ownerId, inboundMessageId: "00000000-0000-0000-0000-000000000000" })
    ).rejects.toThrow(NotFoundError);
  });

  it("persistReplyClassification overwrites the current classification (not append-only) and is auditable", async () => {
    const { message } = await ingestInboundMessage({
      workspaceId: wsId,
      provider: "mock",
      providerMessageId: "classify-msg",
      fromIdentity: "someone@example.com",
      body: "Interested!",
      receivedAt: new Date(),
    });

    const updated = await persistReplyClassification({
      workspaceId: wsId,
      actorUserId: ownerId,
      inboundMessageId: message.id,
      classification: "interested",
      confidence: 0.9,
      limitations: null,
      extractedFacts: ["wants to know rates"],
      suggestedDraftId: null,
    });
    expect(updated.classification).toBe("interested");

    const refetched = await getInboundMessage({ workspaceId: wsId, actorUserId: ownerId, inboundMessageId: message.id });
    expect(refetched.classification).toBe("interested");
    expect(refetched.extractedFacts).toEqual(["wants to know rates"]);
  });

  it("provider mailbox sync state can be recorded and read back (reconciliation-polling bookkeeping)", async () => {
    expect(await getMailboxSyncState({ workspaceId: wsId, provider: "mock" })).toBeNull();
    await recordMailboxSync({ workspaceId: wsId, provider: "mock", syncCursor: "cursor-1" });
    const state = await getMailboxSyncState({ workspaceId: wsId, provider: "mock" });
    expect(state?.syncCursor).toBe("cursor-1");
    expect(state?.lastSyncedAt).not.toBeNull();

    await recordMailboxSync({ workspaceId: wsId, provider: "mock", syncCursor: "cursor-2" });
    const updated = await getMailboxSyncState({ workspaceId: wsId, provider: "mock" });
    expect(updated?.syncCursor).toBe("cursor-2");
  });
});
