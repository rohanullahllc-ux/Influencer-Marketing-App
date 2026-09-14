import { describe, it, expect, beforeEach } from "vitest";
import { withWorkspace, schema } from "@rdv/db";
import { createWorkspaceWithOwner, getUserByEmail } from "@rdv/auth";
import { resetDb } from "./helpers.js";

/**
 * Wave 2 Phase 1 (revised plan §6, §14): RLS cross-workspace isolation for
 * every table introduced in this phase, mirroring tests/db.rls.test.ts's
 * model exactly — a query scoped to workspace A must never return rows
 * belonging to workspace B, using the same application DB role and SQL,
 * differing only in which `app.current_workspace_id` is set. Phase 1 ships
 * no business logic, so these tests insert directly through the
 * RLS-enforced `withWorkspace` client (the same sanctioned path any future
 * phase's business logic will use), not through app-layer functions that
 * don't exist yet.
 */

interface SeededWorkspace {
  wsId: string;
  ownerId: string;
}

async function seedWorkspace(label: string): Promise<SeededWorkspace> {
  const email = `${label}-owner@test.local`;
  const ws = await createWorkspaceWithOwner({ workspaceName: `Workspace ${label}`, ownerEmail: email });
  const owner = await getUserByEmail(email);
  return { wsId: ws.id, ownerId: owner.id };
}

/** Inserts one row in every Phase 1 table, scoped to the given workspace,
 * respecting FK dependency order. Returns each created row's id for
 * assertions. */
async function seedFullChain(seeded: SeededWorkspace, suffix: string) {
  const { wsId, ownerId } = seeded;
  return withWorkspace(wsId, async (tx) => {
    const [product] = await tx
      .insert(schema.products)
      .values({ workspaceId: wsId, name: `Product ${suffix}`, createdBy: ownerId })
      .returning();
    if (!product) throw new Error("insert products failed");

    const [intelligence] = await tx
      .insert(schema.productIntelligence)
      .values({
        workspaceId: wsId,
        productId: product.id,
        status: "approved",
        approvedBy: ownerId,
        approvedAt: new Date(),
      })
      .returning();
    if (!intelligence) throw new Error("insert product_intelligence failed");

    const [creator] = await tx
      .insert(schema.creators)
      .values({
        workspaceId: wsId,
        platform: "youtube",
        platformChannelId: `chan-${suffix}`,
        source: "manual",
        provenance: "human_entered",
      })
      .returning();
    if (!creator) throw new Error("insert creators failed");

    const [campaign] = await tx
      .insert(schema.campaigns)
      .values({ workspaceId: wsId, productId: product.id, name: `Campaign ${suffix}`, createdBy: ownerId })
      .returning();
    if (!campaign) throw new Error("insert campaigns failed");

    const [campaignCreator] = await tx
      .insert(schema.campaignCreators)
      .values({ workspaceId: wsId, campaignId: campaign.id, creatorId: creator.id, addedBy: ownerId })
      .returning();
    if (!campaignCreator) throw new Error("insert campaign_creators failed");

    const [template] = await tx
      .insert(schema.outreachTemplates)
      .values({ workspaceId: wsId, name: `Template ${suffix}`, createdBy: ownerId })
      .returning();
    if (!template) throw new Error("insert outreach_templates failed");

    const [campaignTemplate] = await tx
      .insert(schema.campaignTemplates)
      .values({ workspaceId: wsId, campaignId: campaign.id, templateId: template.id, assignmentSegment: "default" })
      .returning();
    if (!campaignTemplate) throw new Error("insert campaign_templates failed");

    const [qualification] = await tx
      .insert(schema.creatorQualifications)
      .values({
        workspaceId: wsId,
        campaignId: campaign.id,
        creatorId: creator.id,
        thresholdsSnapshot: {},
        measuredValues: {},
        passed: true,
      })
      .returning();
    if (!qualification) throw new Error("insert creator_qualifications failed");

    const [match] = await tx
      .insert(schema.creatorMatches)
      .values({ workspaceId: wsId, campaignId: campaign.id, creatorId: creator.id, score: "0.9", explanation: "test match" })
      .returning();
    if (!match) throw new Error("insert creator_matches failed");

    const [draft] = await tx
      .insert(schema.outreachDrafts)
      .values({
        workspaceId: wsId,
        campaignId: campaign.id,
        creatorId: creator.id,
        templateId: template.id,
        subject: "Hi there",
        body: "Body text",
      })
      .returning();
    if (!draft) throw new Error("insert outreach_drafts failed");

    const [approval] = await tx
      .insert(schema.approvals)
      .values({
        workspaceId: wsId,
        outreachDraftId: draft.id,
        campaignId: campaign.id,
        creatorId: creator.id,
        exactSubject: "Hi there",
        exactBody: "Body text",
        contentHash: `hash-${suffix}`,
      })
      .returning();
    if (!approval) throw new Error("insert approvals failed");

    const [suppression] = await tx
      .insert(schema.suppressions)
      .values({ workspaceId: wsId, normalizedIdentity: `blocked-${suffix}@example.com` })
      .returning();
    if (!suppression) throw new Error("insert suppressions failed");

    const [dryRun] = await tx
      .insert(schema.dryRunEvaluations)
      .values({ workspaceId: wsId, campaignId: campaign.id, triggeredBy: ownerId })
      .returning();
    if (!dryRun) throw new Error("insert dry_run_evaluations failed");

    const [dryRunResult] = await tx
      .insert(schema.dryRunEvaluationResults)
      .values({ workspaceId: wsId, dryRunEvaluationId: dryRun.id, creatorId: creator.id, approvalId: approval.id, eligible: true })
      .returning();
    if (!dryRunResult) throw new Error("insert dry_run_evaluation_results failed");

    return {
      product,
      intelligence,
      creator,
      campaign,
      campaignCreator,
      template,
      campaignTemplate,
      qualification,
      match,
      draft,
      approval,
      suppression,
      dryRun,
      dryRunResult,
    };
  });
}

describe("RLS cross-workspace isolation — Wave 2 Phase 1 domain tables", () => {
  let a: SeededWorkspace;
  let b: SeededWorkspace;
  let seededA: Awaited<ReturnType<typeof seedFullChain>>;

  beforeEach(async () => {
    await resetDb();
    a = await seedWorkspace("phase1-a");
    b = await seedWorkspace("phase1-b");
    seededA = await seedFullChain(a, "a");
    await seedFullChain(b, "b");
  });

  it("scopes products to the current workspace only", async () => {
    const fromA = await withWorkspace(a.wsId, (tx) => tx.select().from(schema.products));
    const fromB = await withWorkspace(b.wsId, (tx) => tx.select().from(schema.products));
    expect(fromA).toHaveLength(1);
    expect(fromA[0]?.id).toBe(seededA.product.id);
    expect(fromB).toHaveLength(1);
    expect(fromB.every((row) => row.workspaceId === b.wsId)).toBe(true);
  });

  it("scopes product_intelligence to the current workspace only", async () => {
    const fromA = await withWorkspace(a.wsId, (tx) => tx.select().from(schema.productIntelligence));
    expect(fromA).toHaveLength(1);
    expect(fromA[0]?.id).toBe(seededA.intelligence.id);
    expect(fromA.every((row) => row.workspaceId === a.wsId)).toBe(true);
  });

  it("scopes creators to the current workspace only", async () => {
    const fromA = await withWorkspace(a.wsId, (tx) => tx.select().from(schema.creators));
    expect(fromA).toHaveLength(1);
    expect(fromA[0]?.id).toBe(seededA.creator.id);
  });

  it("scopes campaigns to the current workspace only", async () => {
    const fromA = await withWorkspace(a.wsId, (tx) => tx.select().from(schema.campaigns));
    expect(fromA).toHaveLength(1);
    expect(fromA[0]?.id).toBe(seededA.campaign.id);
  });

  it("scopes campaign_creators to the current workspace only", async () => {
    const fromA = await withWorkspace(a.wsId, (tx) => tx.select().from(schema.campaignCreators));
    expect(fromA).toHaveLength(1);
    expect(fromA[0]?.campaignId).toBe(seededA.campaignCreator.campaignId);
  });

  it("scopes outreach_templates to the current workspace only", async () => {
    const fromA = await withWorkspace(a.wsId, (tx) => tx.select().from(schema.outreachTemplates));
    expect(fromA).toHaveLength(1);
    expect(fromA[0]?.id).toBe(seededA.template.id);
  });

  it("scopes campaign_templates to the current workspace only", async () => {
    const fromA = await withWorkspace(a.wsId, (tx) => tx.select().from(schema.campaignTemplates));
    expect(fromA).toHaveLength(1);
    expect(fromA[0]?.id).toBe(seededA.campaignTemplate.id);
  });

  it("scopes creator_qualifications to the current workspace only", async () => {
    const fromA = await withWorkspace(a.wsId, (tx) => tx.select().from(schema.creatorQualifications));
    expect(fromA).toHaveLength(1);
    expect(fromA[0]?.id).toBe(seededA.qualification.id);
  });

  it("scopes creator_matches to the current workspace only", async () => {
    const fromA = await withWorkspace(a.wsId, (tx) => tx.select().from(schema.creatorMatches));
    expect(fromA).toHaveLength(1);
    expect(fromA[0]?.id).toBe(seededA.match.id);
  });

  it("scopes outreach_drafts to the current workspace only", async () => {
    const fromA = await withWorkspace(a.wsId, (tx) => tx.select().from(schema.outreachDrafts));
    expect(fromA).toHaveLength(1);
    expect(fromA[0]?.id).toBe(seededA.draft.id);
  });

  it("scopes approvals to the current workspace only", async () => {
    const fromA = await withWorkspace(a.wsId, (tx) => tx.select().from(schema.approvals));
    expect(fromA).toHaveLength(1);
    expect(fromA[0]?.id).toBe(seededA.approval.id);
  });

  it("scopes suppressions to the current workspace only", async () => {
    const fromA = await withWorkspace(a.wsId, (tx) => tx.select().from(schema.suppressions));
    expect(fromA).toHaveLength(1);
    expect(fromA[0]?.id).toBe(seededA.suppression.id);
  });

  it("scopes dry_run_evaluations to the current workspace only", async () => {
    const fromA = await withWorkspace(a.wsId, (tx) => tx.select().from(schema.dryRunEvaluations));
    expect(fromA).toHaveLength(1);
    expect(fromA[0]?.id).toBe(seededA.dryRun.id);
  });

  it("scopes dry_run_evaluation_results to the current workspace only", async () => {
    const fromA = await withWorkspace(a.wsId, (tx) => tx.select().from(schema.dryRunEvaluationResults));
    expect(fromA).toHaveLength(1);
    expect(fromA[0]?.id).toBe(seededA.dryRunResult.id);
  });

  it("a bare, unscoped query sees no Phase 1 tenant rows via the RLS-enforced client", async () => {
    // Mirrors tests/db.rls.test.ts's own proof that RLS itself — not
    // application discipline — enforces isolation, re-checked here against
    // a brand-new table to confirm the same policy shape holds for it too.
    const { db } = await import("@rdv/db");
    const rows = await db.select().from(schema.products);
    expect(rows).toHaveLength(0);
  });

  it("enforces at most one approved product_intelligence version per product", async () => {
    // Plan §14.2: a partial unique index, not app-layer discipline, is what
    // guarantees this — attempting a second concurrently-approved row for
    // the same product must fail at the database level.
    await expect(
      withWorkspace(a.wsId, (tx) =>
        tx.insert(schema.productIntelligence).values({
          workspaceId: a.wsId,
          productId: seededA.product.id,
          status: "approved",
          approvedBy: a.ownerId,
          approvedAt: new Date(),
        })
      )
    ).rejects.toThrow();
  });
});
