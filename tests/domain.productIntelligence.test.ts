import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  createProduct,
  requestProductIntelligenceGeneration,
  persistGeneratedIntelligence,
  listProductIntelligenceVersions,
  getApprovedProductIntelligence,
  editProductIntelligence,
  approveProductIntelligence,
  type GeneratedIntelligenceData,
} from "@rdv/domain";
import { createWorkspaceWithOwner, addMember, getUserByEmail } from "@rdv/auth";
import { QUEUE_LANES, getQueue, closeAllQueues, closeRedisConnection } from "@rdv/queue";
import { resetDb } from "./helpers.js";

const SAMPLE: GeneratedIntelligenceData = {
  idealCustomer: ["busy parents"],
  problems: ["no time to cook"],
  benefits: ["saves time"],
  niches: ["food"],
  subNiches: ["meal kits"],
  creatorTypes: ["lifestyle vloggers"],
  countries: ["US"],
  languages: ["en"],
  topics: ["cooking"],
  keywords: ["meal kit", "dinner"],
  audienceRationale: "Parents short on time value convenience.",
  confidence: 0.8,
};

/**
 * Wave 2 Phase 2 (plan §7, §14.2): Product Intelligence generation
 * request, persistence, human edit, and the explicit approve transaction
 * — the "AI drafts, human reviews/edits, human explicitly approves, only
 * approved data is authoritative" chain, exercised against real local
 * Postgres + Redis (the enqueue test uses a real BullMQ queue, not a
 * mock, mirroring tests/worker.foundation.test.ts).
 */
describe("Product Intelligence", () => {
  let wsId: string;
  let ownerId: string;
  let memberOperatorId: string;
  let productId: string;

  beforeEach(async () => {
    await resetDb();
    const ws = await createWorkspaceWithOwner({ workspaceName: "PI WS", ownerEmail: "pi-owner@test.local" });
    wsId = ws.id;
    ownerId = (await getUserByEmail("pi-owner@test.local")).id;

    await addMember({
      workspaceId: wsId,
      actorUserId: ownerId,
      targetEmail: "pi-operator@test.local",
      role: "member_operator",
    });
    memberOperatorId = (await getUserByEmail("pi-operator@test.local")).id;

    const product = await createProduct({ workspaceId: wsId, actorUserId: ownerId, name: "Meal Kit Co" });
    productId = product.id;
  });

  afterAll(async () => {
    await closeAllQueues();
    await closeRedisConnection();
  });

  it("enqueues a real ai_analyze_product job on the ai-ops lane", async () => {
    const { jobId } = await requestProductIntelligenceGeneration({
      workspaceId: wsId,
      actorUserId: ownerId,
      productId,
    });

    const job = await getQueue(QUEUE_LANES.aiOps).getJob(jobId);
    expect(job).toBeDefined();
    expect(job?.name).toBe("ai_analyze_product");
    expect(job?.data).toMatchObject({ workspaceId: wsId, productId });

    // Clean up so this real, shared-Redis job doesn't linger and pollute
    // other tests' view of the ai-ops lane (mirrors tests/queue.lanes.test.ts's own convention).
    await job?.remove();
  });

  it("rejects generation for a product that does not exist", async () => {
    await expect(
      requestProductIntelligenceGeneration({
        workspaceId: wsId,
        actorUserId: ownerId,
        productId: "00000000-0000-0000-0000-000000000000",
      })
    ).rejects.toThrow(/No product/);
  });

  it("persists a generated draft with ai_derived origin and no approval yet", async () => {
    const row = await persistGeneratedIntelligence({ workspaceId: wsId, productId, data: SAMPLE });
    expect(row.status).toBe("draft");
    expect(row.origin).toBe("ai_derived");
    expect(row.approvedAt).toBeNull();
    expect(row.editedAt).toBeNull();
    expect(row.idealCustomer).toEqual(SAMPLE.idealCustomer);

    const approved = await getApprovedProductIntelligence({ workspaceId: wsId, productId });
    expect(approved).toBeNull();
  });

  it("editing a draft records edited_by/edited_at without touching origin or status", async () => {
    const draft = await persistGeneratedIntelligence({ workspaceId: wsId, productId, data: SAMPLE });

    const edited = await editProductIntelligence({
      workspaceId: wsId,
      actorUserId: memberOperatorId,
      intelligenceId: draft.id,
      patch: { benefits: ["saves time", "reduces food waste"] },
    });

    expect(edited.benefits).toEqual(["saves time", "reduces food waste"]);
    expect(edited.editedBy).toBe(memberOperatorId);
    expect(edited.editedAt).not.toBeNull();
    // Editing must never silently approve — status stays draft.
    expect(edited.status).toBe("draft");
    expect(edited.origin).toBe("ai_derived");
    expect(edited.approvedBy).toBeNull();
  });

  it("refuses to edit an approved or superseded version", async () => {
    const draft = await persistGeneratedIntelligence({ workspaceId: wsId, productId, data: SAMPLE });
    await approveProductIntelligence({ workspaceId: wsId, actorUserId: ownerId, intelligenceId: draft.id });

    await expect(
      editProductIntelligence({
        workspaceId: wsId,
        actorUserId: ownerId,
        intelligenceId: draft.id,
        patch: { audienceRationale: "changed after approval" },
      })
    ).rejects.toThrow(/Only a draft version can be edited/);
  });

  it("approve requires Admin — a Member-Operator is rejected", async () => {
    const draft = await persistGeneratedIntelligence({ workspaceId: wsId, productId, data: SAMPLE });

    await expect(
      approveProductIntelligence({ workspaceId: wsId, actorUserId: memberOperatorId, intelligenceId: draft.id })
    ).rejects.toThrow();

    const approved = await getApprovedProductIntelligence({ workspaceId: wsId, productId });
    expect(approved).toBeNull();
  });

  it("approving sets approved_by/approved_at and never changes origin, and only one version is approved at a time", async () => {
    const draftOne = await persistGeneratedIntelligence({ workspaceId: wsId, productId, data: SAMPLE });
    const approvedOne = await approveProductIntelligence({
      workspaceId: wsId,
      actorUserId: ownerId,
      intelligenceId: draftOne.id,
    });
    expect(approvedOne.status).toBe("approved");
    expect(approvedOne.approvedBy).toBe(ownerId);
    expect(approvedOne.approvedAt).not.toBeNull();
    expect(approvedOne.origin).toBe("ai_derived");

    const current = await getApprovedProductIntelligence({ workspaceId: wsId, productId });
    expect(current?.id).toBe(draftOne.id);

    // Re-running generation and approving the new draft must supersede
    // the previous approved version (plan §14.2's approve transaction),
    // never leaving two simultaneously "approved" rows.
    const draftTwo = await persistGeneratedIntelligence({ workspaceId: wsId, productId, data: SAMPLE });
    const approvedTwo = await approveProductIntelligence({
      workspaceId: wsId,
      actorUserId: ownerId,
      intelligenceId: draftTwo.id,
    });
    expect(approvedTwo.status).toBe("approved");

    const versions = await listProductIntelligenceVersions({ workspaceId: wsId, actorUserId: ownerId, productId });
    const firstAfter = versions.find((v) => v.id === draftOne.id);
    expect(firstAfter?.status).toBe("superseded");

    const currentAfter = await getApprovedProductIntelligence({ workspaceId: wsId, productId });
    expect(currentAfter?.id).toBe(draftTwo.id);
  });

  it("rejects approving an already-approved or superseded version", async () => {
    const draftOne = await persistGeneratedIntelligence({ workspaceId: wsId, productId, data: SAMPLE });
    await approveProductIntelligence({ workspaceId: wsId, actorUserId: ownerId, intelligenceId: draftOne.id });

    await expect(
      approveProductIntelligence({ workspaceId: wsId, actorUserId: ownerId, intelligenceId: draftOne.id })
    ).rejects.toThrow(/already approved/);

    const draftTwo = await persistGeneratedIntelligence({ workspaceId: wsId, productId, data: SAMPLE });
    await approveProductIntelligence({ workspaceId: wsId, actorUserId: ownerId, intelligenceId: draftTwo.id });

    // draftOne is now superseded — approving it again must fail distinctly.
    await expect(
      approveProductIntelligence({ workspaceId: wsId, actorUserId: ownerId, intelligenceId: draftOne.id })
    ).rejects.toThrow(/superseded/);
  });
});
