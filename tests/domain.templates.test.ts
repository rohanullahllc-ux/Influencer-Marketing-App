import { describe, it, expect, beforeEach } from "vitest";
import {
  createProduct,
  createCampaign,
  createTemplate,
  listTemplates,
  getTemplate,
  updateTemplate,
  assignTemplateToCampaign,
  listCampaignTemplates,
} from "@rdv/domain";
import { createWorkspaceWithOwner, getUserByEmail } from "@rdv/auth";
import { resetDb } from "./helpers.js";

/** Wave 2 Phase 4 (plan §9): Outreach Template CRUD and campaign↔template assignment by segment. */
describe("Outreach Templates + assignment", () => {
  let wsId: string;
  let ownerId: string;
  let campaignId: string;

  beforeEach(async () => {
    await resetDb();
    const ws = await createWorkspaceWithOwner({ workspaceName: "Template WS", ownerEmail: "template-owner@test.local" });
    wsId = ws.id;
    ownerId = (await getUserByEmail("template-owner@test.local")).id;
    const product = await createProduct({ workspaceId: wsId, actorUserId: ownerId, name: "Meal Kit Co" });
    const campaign = await createCampaign({ workspaceId: wsId, actorUserId: ownerId, input: { productId: product.id, name: "Spring" } });
    campaignId = campaign.id;
  });

  it("creates a template with draft status by default", async () => {
    const template = await createTemplate({
      workspaceId: wsId,
      actorUserId: ownerId,
      name: "Intro Email",
      subject: "Hi {{creator_name}}",
      body: "We love your content...",
      variables: ["creator_name"],
    });
    expect(template.status).toBe("draft");
    expect(template.name).toBe("Intro Email");
  });

  it("rejects an empty name", async () => {
    await expect(createTemplate({ workspaceId: wsId, actorUserId: ownerId, name: "  " })).rejects.toThrow(/name is required/);
  });

  it("lists, gets, and updates a template", async () => {
    const created = await createTemplate({ workspaceId: wsId, actorUserId: ownerId, name: "Original" });
    const list = await listTemplates({ workspaceId: wsId, actorUserId: ownerId });
    expect(list.map((t) => t.id)).toContain(created.id);

    const found = await getTemplate({ workspaceId: wsId, actorUserId: ownerId, templateId: created.id });
    expect(found.id).toBe(created.id);

    const updated = await updateTemplate({
      workspaceId: wsId,
      actorUserId: ownerId,
      templateId: created.id,
      status: "active",
      subject: "New subject",
    });
    expect(updated.status).toBe("active");
    expect(updated.subject).toBe("New subject");
  });

  it("throws NotFoundError for an unknown template id", async () => {
    await expect(
      getTemplate({ workspaceId: wsId, actorUserId: ownerId, templateId: "00000000-0000-0000-0000-000000000000" })
    ).rejects.toThrow(/No template/);
  });

  it("assigns a template to a campaign segment, and reassigning the same segment updates rather than duplicates", async () => {
    const templateA = await createTemplate({ workspaceId: wsId, actorUserId: ownerId, name: "A" });
    const templateB = await createTemplate({ workspaceId: wsId, actorUserId: ownerId, name: "B" });

    const first = await assignTemplateToCampaign({
      workspaceId: wsId,
      actorUserId: ownerId,
      campaignId,
      templateId: templateA.id,
      assignmentSegment: "default",
    });
    expect(first.templateId).toBe(templateA.id);

    const reassigned = await assignTemplateToCampaign({
      workspaceId: wsId,
      actorUserId: ownerId,
      campaignId,
      templateId: templateB.id,
      assignmentSegment: "default",
    });
    expect(reassigned.id).toBe(first.id);
    expect(reassigned.templateId).toBe(templateB.id);

    const assignments = await listCampaignTemplates({ workspaceId: wsId, actorUserId: ownerId, campaignId });
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.templateId).toBe(templateB.id);
  });

  it("allows multiple segments on the same campaign", async () => {
    const templateA = await createTemplate({ workspaceId: wsId, actorUserId: ownerId, name: "A" });
    const templateB = await createTemplate({ workspaceId: wsId, actorUserId: ownerId, name: "B" });

    await assignTemplateToCampaign({ workspaceId: wsId, actorUserId: ownerId, campaignId, templateId: templateA.id, assignmentSegment: "top-tier" });
    await assignTemplateToCampaign({ workspaceId: wsId, actorUserId: ownerId, campaignId, templateId: templateB.id, assignmentSegment: "long-tail" });

    const assignments = await listCampaignTemplates({ workspaceId: wsId, actorUserId: ownerId, campaignId });
    expect(assignments).toHaveLength(2);
  });

  it("rejects assigning a nonexistent template", async () => {
    await expect(
      assignTemplateToCampaign({
        workspaceId: wsId,
        actorUserId: ownerId,
        campaignId,
        templateId: "00000000-0000-0000-0000-000000000000",
        assignmentSegment: "default",
      })
    ).rejects.toThrow(/No template/);
  });
});
