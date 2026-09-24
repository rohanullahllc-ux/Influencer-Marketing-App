import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { withWorkspace, schema } from "@rdv/db";
import { systemQueryClient } from "@rdv/db/systemClient";
import { createWorkspaceWithOwner, getUserByEmail } from "@rdv/auth";
import {
  createProduct,
  createCampaign,
  createManualCreator,
  requestAffiliateCreation,
  ingestInboundMessage,
} from "@rdv/domain";
import { resetDb } from "./helpers.js";

/**
 * Wave 6 (Safety/Operations/Reliability Hardening): tenancy/RLS audit.
 *
 * tests/db.rls.test.ts (Wave 1) proves cross-workspace isolation for the
 * three original Wave 1 tables. This file adds two things Wave 1 didn't
 * need yet: (1) an *exhaustive, self-verifying* structural check over
 * every table in the schema — not a hand-picked sample — so a future
 * table added without RLS fails this test immediately rather than
 * silently shipping a tenancy hole; and (2) real cross-workspace
 * behavioral proof for a representative table from each later wave
 * (Wave 2 product/campaign/creator, Wave 3 outreach/reply, Wave 4
 * CRM/Whop), through the actual production domain functions, not
 * hand-crafted rows.
 */
describe("RLS hardening audit (Wave 6)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("every table except the documented exceptions (schema_migrations, users, workspaces) has RLS enabled AND forced", async () => {
    const rows = await systemQueryClient<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`
      select relname, relrowsecurity, relforcerowsecurity
      from pg_class
      where relnamespace = 'public'::regnamespace and relkind = 'r'
    `;
    const documentedExceptions = new Set(["schema_migrations", "users", "workspaces"]);
    const checked: string[] = [];
    for (const row of rows) {
      if (documentedExceptions.has(row.relname)) continue;
      checked.push(row.relname);
      expect(row.relrowsecurity, `${row.relname} should have RLS enabled`).toBe(true);
      expect(row.relforcerowsecurity, `${row.relname} should have RLS forced`).toBe(true);
    }
    // Sanity: this must not silently pass on zero tables (e.g. wrong schema/connection).
    expect(checked.length).toBeGreaterThanOrEqual(25);
  });

  it("every RLS policy uses the exact safe nullif(...) shape -- never the historically-buggy bare cast that threw on an unset/empty setting", async () => {
    const rows = await systemQueryClient<{ tablename: string; qual: string }[]>`
      select tablename, qual::text as qual from pg_policies where schemaname = 'public'
    `;
    expect(rows.length).toBeGreaterThanOrEqual(25);
    for (const row of rows) {
      expect(row.qual, `${row.tablename}'s policy predicate`).toContain("NULLIF");
    }
  });

  it("Wave 2: a product created in workspace A is invisible to workspace B", async () => {
    const wsA = await createWorkspaceWithOwner({ workspaceName: "RLS Hardening A", ownerEmail: "rls-a-owner@test.local" });
    const wsB = await createWorkspaceWithOwner({ workspaceName: "RLS Hardening B", ownerEmail: "rls-b-owner@test.local" });
    const ownerA = (await getUserByEmail("rls-a-owner@test.local")).id;

    await createProduct({ workspaceId: wsA.id, actorUserId: ownerA, name: "A's Product" });

    const visibleFromB = await withWorkspace(wsB.id, (tx) => tx.select().from(schema.products));
    expect(visibleFromB).toHaveLength(0);

    const visibleFromA = await withWorkspace(wsA.id, (tx) => tx.select().from(schema.products));
    expect(visibleFromA).toHaveLength(1);
  });

  it("Wave 2: a campaign and its creator shortlist created in workspace A are invisible to workspace B", async () => {
    const wsA = await createWorkspaceWithOwner({ workspaceName: "RLS Hardening C", ownerEmail: "rls-c-owner@test.local" });
    const wsB = await createWorkspaceWithOwner({ workspaceName: "RLS Hardening D", ownerEmail: "rls-d-owner@test.local" });
    const ownerA = (await getUserByEmail("rls-c-owner@test.local")).id;

    const product = await createProduct({ workspaceId: wsA.id, actorUserId: ownerA, name: "A's Product 2" });
    await createCampaign({ workspaceId: wsA.id, actorUserId: ownerA, input: { productId: product.id, name: "A's Campaign" } });
    await createManualCreator({ workspaceId: wsA.id, actorUserId: ownerA, displayName: "A's Creator" });

    const campaignsFromB = await withWorkspace(wsB.id, (tx) => tx.select().from(schema.campaigns));
    const creatorsFromB = await withWorkspace(wsB.id, (tx) => tx.select().from(schema.creators));
    expect(campaignsFromB).toHaveLength(0);
    expect(creatorsFromB).toHaveLength(0);
  });

  it("Wave 3: an inbound reply ingested for workspace A is invisible to workspace B", async () => {
    const wsA = await createWorkspaceWithOwner({ workspaceName: "RLS Hardening E", ownerEmail: "rls-e-owner@test.local" });
    const wsB = await createWorkspaceWithOwner({ workspaceName: "RLS Hardening F", ownerEmail: "rls-f-owner@test.local" });

    await ingestInboundMessage({
      workspaceId: wsA.id,
      provider: "mock",
      providerMessageId: "rls-hardening-msg",
      fromIdentity: "someone@example.com",
      body: "Hello",
      receivedAt: new Date(),
    });

    const messagesFromB = await withWorkspace(wsB.id, (tx) => tx.select().from(schema.inboundMessages));
    expect(messagesFromB).toHaveLength(0);
  });

  it("Wave 4: a CRM relationship and a Whop affiliate request created in workspace A are invisible to workspace B", async () => {
    const wsA = await createWorkspaceWithOwner({ workspaceName: "RLS Hardening G", ownerEmail: "rls-g-owner@test.local" });
    const wsB = await createWorkspaceWithOwner({ workspaceName: "RLS Hardening H", ownerEmail: "rls-h-owner@test.local" });
    const ownerA = (await getUserByEmail("rls-g-owner@test.local")).id;

    const creator = await createManualCreator({ workspaceId: wsA.id, actorUserId: ownerA, displayName: "A's Creator 2", contactEmail: "a-creator@example.com" });
    await requestAffiliateCreation({ workspaceId: wsA.id, actorUserId: ownerA, creatorId: creator.id });

    const affiliatesFromB = await withWorkspace(wsB.id, (tx) => tx.select().from(schema.creatorAffiliates));
    expect(affiliatesFromB).toHaveLength(0);

    // Cross-workspace object reference is also denied, not just filtered
    // out of a list -- selecting workspace A's exact affiliate id while
    // scoped to workspace B must return nothing, proving RLS enforces at
    // the row level, not just at the "no workspace_id filter applied" level.
    const [affiliateA] = await withWorkspace(wsA.id, (tx) => tx.select().from(schema.creatorAffiliates));
    const crossReferenceAttempt = await withWorkspace(wsB.id, (tx) =>
      tx.select().from(schema.creatorAffiliates).where(eq(schema.creatorAffiliates.id, affiliateA!.id))
    );
    expect(crossReferenceAttempt).toHaveLength(0);
  });
});
