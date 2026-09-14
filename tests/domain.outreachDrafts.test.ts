import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  createProduct,
  createCampaign,
  createManualCreator,
  shortlistCreator,
  createTemplate,
  assignTemplateToCampaign,
  requestOutreachDraftGeneration,
  persistOutreachDraft,
  getOutreachDraft,
  editOutreachDraft,
  resolveTemplateForCampaign,
  createApprovalForDraft,
} from "@rdv/domain";
import { createWorkspaceWithOwner, getUserByEmail } from "@rdv/auth";
import { QUEUE_LANES, getQueue, closeAllQueues, closeRedisConnection } from "@rdv/queue";
import { resetDb } from "./helpers.js";

/** Wave 2 Phase 6 (plan §11): outreach draft generation request/persist/edit, and template resolution. */
describe("Outreach Drafts", () => {
  let wsId: string;
  let ownerId: string;
  let productId: string;
  let campaignId: string;
  let creatorId: string;

  beforeEach(async () => {
    await resetDb();
    const ws = await createWorkspaceWithOwner({ workspaceName: "Draft WS", ownerEmail: "draft-owner@test.local" });
    wsId = ws.id;
    ownerId = (await getUserByEmail("draft-owner@test.local")).id;
    const product = await createProduct({ workspaceId: wsId, actorUserId: ownerId, name: "Meal Kit Co" });
    productId = product.id;
    const campaign = await createCampaign({ workspaceId: wsId, actorUserId: ownerId, input: { productId, name: "Spring" } });
    campaignId = campaign.id;
    const creator = await createManualCreator({ workspaceId: wsId, actorUserId: ownerId, displayName: "Cook" });
    creatorId = creator.id;
    await shortlistCreator({ workspaceId: wsId, actorUserId: ownerId, campaignId, creatorId });
  });

  afterAll(async () => {
    await closeAllQueues();
    await closeRedisConnection();
  });

  it("rejects a draft request for a creator not shortlisted on the campaign", async () => {
    const stranger = await createManualCreator({ workspaceId: wsId, actorUserId: ownerId, displayName: "Stranger" });
    await expect(
      requestOutreachDraftGeneration({ workspaceId: wsId, actorUserId: ownerId, campaignId, creatorId: stranger.id })
    ).rejects.toThrow(/not shortlisted/);
  });

  it("enqueues a real ai_personalize_outreach job for a shortlisted creator", async () => {
    const { jobId } = await requestOutreachDraftGeneration({ workspaceId: wsId, actorUserId: ownerId, campaignId, creatorId });
    const job = await getQueue(QUEUE_LANES.aiOps).getJob(jobId);
    expect(job).toBeDefined();
    expect(job?.name).toBe("ai_personalize_outreach");
    expect(job?.data).toMatchObject({ workspaceId: wsId, campaignId, creatorId });
    await job?.remove();
  });

  it("resolves the default-segment template, falls back to the sole assignment, and returns null with none", async () => {
    const none = await resolveTemplateForCampaign({ workspaceId: wsId, campaignId, explicitTemplateId: null });
    expect(none).toBeNull();

    const templateA = await createTemplate({ workspaceId: wsId, actorUserId: ownerId, name: "A", subject: "S-A", body: "B-A" });
    await assignTemplateToCampaign({ workspaceId: wsId, actorUserId: ownerId, campaignId, templateId: templateA.id, assignmentSegment: "top-tier" });

    const solo = await resolveTemplateForCampaign({ workspaceId: wsId, campaignId, explicitTemplateId: null });
    expect(solo?.id).toBe(templateA.id);

    const templateB = await createTemplate({ workspaceId: wsId, actorUserId: ownerId, name: "B", subject: "S-B", body: "B-B" });
    await assignTemplateToCampaign({ workspaceId: wsId, actorUserId: ownerId, campaignId, templateId: templateB.id, assignmentSegment: "default" });

    // Now two segments exist — "default" must win over ambiguity.
    const withDefault = await resolveTemplateForCampaign({ workspaceId: wsId, campaignId, explicitTemplateId: null });
    expect(withDefault?.id).toBe(templateB.id);

    const explicit = await resolveTemplateForCampaign({ workspaceId: wsId, campaignId, explicitTemplateId: templateA.id });
    expect(explicit?.id).toBe(templateA.id);
  });

  it("persists a draft, reads it back, and edits its content", async () => {
    const draft = await persistOutreachDraft({
      workspaceId: wsId,
      campaignId,
      creatorId,
      templateId: null,
      subject: "Original subject",
      body: "Original body",
      generationInput: { note: "test" },
    });
    expect(draft.status).toBe("draft");
    expect(draft.provenance).toBe("ai_derived");

    const found = await getOutreachDraft({ workspaceId: wsId, actorUserId: ownerId, draftId: draft.id });
    expect(found.subject).toBe("Original subject");

    const edited = await editOutreachDraft({ workspaceId: wsId, actorUserId: ownerId, draftId: draft.id, subject: "New subject" });
    expect(edited.subject).toBe("New subject");
    expect(edited.body).toBe("Original body");
    expect(edited.status).toBe("edited");
  });

  it("rejects editing with no fields and an empty subject/body", async () => {
    const draft = await persistOutreachDraft({
      workspaceId: wsId,
      campaignId,
      creatorId,
      templateId: null,
      subject: "S",
      body: "B",
      generationInput: {},
    });

    await expect(editOutreachDraft({ workspaceId: wsId, actorUserId: ownerId, draftId: draft.id })).rejects.toThrow(
      /subject and\/or body is required/
    );
    await expect(
      editOutreachDraft({ workspaceId: wsId, actorUserId: ownerId, draftId: draft.id, subject: "   " })
    ).rejects.toThrow(/subject must not be empty/);
  });

  it("editing a draft with no approval yet is a no-op for approvals (nothing to invalidate)", async () => {
    const draft = await persistOutreachDraft({
      workspaceId: wsId,
      campaignId,
      creatorId,
      templateId: null,
      subject: "S",
      body: "B",
      generationInput: {},
    });
    const edited = await editOutreachDraft({ workspaceId: wsId, actorUserId: ownerId, draftId: draft.id, body: "New body" });
    expect(edited.body).toBe("New body");
  });

  it("editing an approved draft invalidates its approval — the core Phase 6 acceptance criterion", async () => {
    const draft = await persistOutreachDraft({
      workspaceId: wsId,
      campaignId,
      creatorId,
      templateId: null,
      subject: "Hi there",
      body: "Original body",
      generationInput: {},
    });
    const approval = await createApprovalForDraft({ workspaceId: wsId, actorUserId: ownerId, draftId: draft.id });
    expect(approval.status).toBe("pending");
    expect(approval.exactSubject).toBe("Hi there");

    await editOutreachDraft({ workspaceId: wsId, actorUserId: ownerId, draftId: draft.id, body: "Changed body" });

    // The approval snapshot itself never changes (exact_subject/exact_body
    // stay the original pinned content) — only its status flips.
    const { getApproval } = await import("@rdv/domain");
    const refreshed = await getApproval({ workspaceId: wsId, actorUserId: ownerId, approvalId: approval.id });
    expect(refreshed.status).toBe("invalidated");
    expect(refreshed.exactBody).toBe("Original body");
  });
});
