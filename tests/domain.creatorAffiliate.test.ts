import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import {
  createManualCreator,
  requestAffiliateCreation,
  getCreatorAffiliate,
  listCreatorAffiliatesForCreator,
  executeAffiliateCreation,
  ingestWhopConversion,
  listConversionsForAffiliate,
  pollWhopConversions,
  computeAffiliateIdempotencyKey,
} from "@rdv/domain";
import { createWorkspaceWithOwner, addMember, getUserByEmail } from "@rdv/auth";
import { withWorkspace, schema } from "@rdv/db";
import { closeAllQueues, closeRedisConnection } from "@rdv/queue";
import { AuthorizationError, NotFoundError, ValidationError } from "@rdv/lib";
import { resetDb } from "./helpers.js";

/**
 * Wave 4 (Whop Affiliate/Conversion): human-triggered affiliate creation
 * and polling-based conversion tracking against the real Mock Whop
 * provider (see packages/domain/src/providers/mockWhopProvider.ts). No
 * network calls anywhere in this file. Mirrors the design/test shape of
 * tests/domain.outreachSend.test.ts deliberately.
 */
describe("Whop Affiliate/Conversion (Wave 4)", () => {
  let wsId: string;
  let ownerId: string;
  let memberOperatorId: string;

  beforeEach(async () => {
    await resetDb();
    const ws = await createWorkspaceWithOwner({ workspaceName: "Whop WS", ownerEmail: "whop-owner@test.local" });
    wsId = ws.id;
    ownerId = (await getUserByEmail("whop-owner@test.local")).id;
    await addMember({ workspaceId: wsId, actorUserId: ownerId, targetEmail: "whop-operator@test.local", role: "member_operator" });
    memberOperatorId = (await getUserByEmail("whop-operator@test.local")).id;
  });

  afterAll(async () => {
    await closeAllQueues();
    await closeRedisConnection();
  });

  async function creator(email: string) {
    return createManualCreator({ workspaceId: wsId, actorUserId: ownerId, displayName: "Cook", contactEmail: email });
  }

  async function forceStatus(affiliateId: string, status: "creating" | "pending") {
    await withWorkspace(wsId, (tx) => tx.update(schema.creatorAffiliates).set({ status }).where(eq(schema.creatorAffiliates.id, affiliateId)));
  }

  it("computeAffiliateIdempotencyKey is a pure, deterministic composition", () => {
    expect(computeAffiliateIdempotencyKey("cr1", "camp1")).toBe("cr1:camp1");
    expect(computeAffiliateIdempotencyKey("cr1", null)).toBe("cr1:none");
  });

  it("requests and executes a real affiliate creation end to end -> active, with a real provider affiliate id + code", async () => {
    const c = await creator("cook@example.com");
    const requested = await requestAffiliateCreation({ workspaceId: wsId, actorUserId: ownerId, creatorId: c.id });
    expect(requested.status).toBe("pending");
    expect(requested.requestedBy).toBe(ownerId);

    const result = await executeAffiliateCreation({ workspaceId: wsId, creatorAffiliateId: requested.id });
    expect(result.status).toBe("active");

    const final = await getCreatorAffiliate({ workspaceId: wsId, actorUserId: ownerId, creatorAffiliateId: requested.id });
    expect(final.status).toBe("active");
    expect(final.providerAffiliateId).toMatch(/^mock-affiliate-/);
    expect(final.affiliateCode).toMatch(/^MOCK-/);
    expect(final.confirmedAt).not.toBeNull();
  });

  it("is admin-only: a Member-Operator cannot request affiliate creation", async () => {
    const c = await creator("cook@example.com");
    await expect(
      requestAffiliateCreation({ workspaceId: wsId, actorUserId: memberOperatorId, creatorId: c.id })
    ).rejects.toThrow(AuthorizationError);
  });

  it("rejects requesting affiliate creation for a creator with no contact email", async () => {
    const c = await createManualCreator({ workspaceId: wsId, actorUserId: ownerId, displayName: "No Email Cook" });
    await expect(requestAffiliateCreation({ workspaceId: wsId, actorUserId: ownerId, creatorId: c.id })).rejects.toThrow(ValidationError);
  });

  it("idempotency: a second request for the same creator (no campaign) returns the same row, never a second one, and never re-enqueues once no longer pending", async () => {
    const c = await creator("cook@example.com");
    const first = await requestAffiliateCreation({ workspaceId: wsId, actorUserId: ownerId, creatorId: c.id });
    await executeAffiliateCreation({ workspaceId: wsId, creatorAffiliateId: first.id });

    const second = await requestAffiliateCreation({ workspaceId: wsId, actorUserId: ownerId, creatorId: c.id });
    expect(second.id).toBe(first.id);
    expect(second.status).toBe("active"); // unchanged by the duplicate request
  });

  it("records a real provider 'unknown' outcome distinctly, never upgraded to active or failed", async () => {
    const c = await creator("cook+mockunknown@example.com");
    const requested = await requestAffiliateCreation({ workspaceId: wsId, actorUserId: ownerId, creatorId: c.id });
    const result = await executeAffiliateCreation({ workspaceId: wsId, creatorAffiliateId: requested.id });
    expect(result.status).toBe("unknown");
    const final = await getCreatorAffiliate({ workspaceId: wsId, actorUserId: ownerId, creatorAffiliateId: requested.id });
    expect(final.status).toBe("unknown");
    expect(final.providerAffiliateId).toBeNull();
  });

  it("records a real provider 'failed' outcome distinctly from 'unknown'", async () => {
    const c = await creator("cook+mockfail@example.com");
    const requested = await requestAffiliateCreation({ workspaceId: wsId, actorUserId: ownerId, creatorId: c.id });
    const result = await executeAffiliateCreation({ workspaceId: wsId, creatorAffiliateId: requested.id });
    expect(result.status).toBe("failed");
  });

  it("interruption safety: an affiliate found already 'creating' (a prior crash after contacting the provider) is marked 'unknown', never blindly retried", async () => {
    // +mockfail: if the domain layer incorrectly retried the provider
    // call, this would resolve to 'failed', not 'unknown'.
    const c = await creator("cook+mockfail@example.com");
    const requested = await requestAffiliateCreation({ workspaceId: wsId, actorUserId: ownerId, creatorId: c.id });
    await forceStatus(requested.id, "creating");

    const result = await executeAffiliateCreation({ workspaceId: wsId, creatorAffiliateId: requested.id });
    expect(result.status).toBe("unknown");
    const final = await getCreatorAffiliate({ workspaceId: wsId, actorUserId: ownerId, creatorAffiliateId: requested.id });
    expect(final.statusReason).toMatch(/interrupted/i);
  });

  it("re-executing an already-terminal affiliate creation is a safe no-op", async () => {
    const c = await creator("cook@example.com");
    const requested = await requestAffiliateCreation({ workspaceId: wsId, actorUserId: ownerId, creatorId: c.id });
    const first = await executeAffiliateCreation({ workspaceId: wsId, creatorAffiliateId: requested.id });
    expect(first.status).toBe("active");

    const second = await executeAffiliateCreation({ workspaceId: wsId, creatorAffiliateId: requested.id });
    expect(second.status).toBe("active");
  });

  it("lists affiliates for a creator", async () => {
    const c = await creator("cook@example.com");
    await requestAffiliateCreation({ workspaceId: wsId, actorUserId: ownerId, creatorId: c.id });
    const list = await listCreatorAffiliatesForCreator({ workspaceId: wsId, actorUserId: ownerId, creatorId: c.id });
    expect(list).toHaveLength(1);
  });

  it("ingests a real conversion event and dedupes a replayed poll of the same event", async () => {
    const c = await creator("cook@example.com");
    const requested = await requestAffiliateCreation({ workspaceId: wsId, actorUserId: ownerId, creatorId: c.id });
    await executeAffiliateCreation({ workspaceId: wsId, creatorAffiliateId: requested.id });

    const first = await ingestWhopConversion({
      workspaceId: wsId,
      creatorAffiliateId: requested.id,
      provider: "mock",
      providerEventId: "evt-1",
      eventType: "order",
      occurredAt: new Date(),
      amount: 49.99,
      currency: "USD",
    });
    expect(first.wasNew).toBe(true);
    expect(first.conversion.amount).toBe("49.99");

    // A replayed poll delivering the same event id is a true no-op.
    const replay = await ingestWhopConversion({
      workspaceId: wsId,
      creatorAffiliateId: requested.id,
      provider: "mock",
      providerEventId: "evt-1",
      eventType: "order",
      occurredAt: new Date(),
      amount: 999,
    });
    expect(replay.wasNew).toBe(false);
    expect(replay.conversion.amount).toBe("49.99"); // untouched by the replay's different amount

    const list = await listConversionsForAffiliate({ workspaceId: wsId, actorUserId: ownerId, creatorAffiliateId: requested.id });
    expect(list).toHaveLength(1);
  });

  it("rejects ingesting a conversion for a nonexistent affiliate", async () => {
    await expect(
      ingestWhopConversion({
        workspaceId: wsId,
        creatorAffiliateId: "00000000-0000-0000-0000-000000000000",
        provider: "mock",
        providerEventId: "evt-1",
        eventType: "click",
        occurredAt: new Date(),
      })
    ).rejects.toThrow(NotFoundError);
  });

  it("pollWhopConversions walks every real active affiliate against the provider abstraction (honestly returns zero from the Mock, never fabricated)", async () => {
    const c = await creator("cook@example.com");
    const requested = await requestAffiliateCreation({ workspaceId: wsId, actorUserId: ownerId, creatorId: c.id });
    await executeAffiliateCreation({ workspaceId: wsId, creatorAffiliateId: requested.id });

    const result = await pollWhopConversions({ workspaceId: wsId });
    expect(result.affiliatesPolled).toBe(1);
    expect(result.newConversions).toBe(0);
  });
});
