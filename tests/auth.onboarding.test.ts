import { describe, it, expect, beforeEach } from "vitest";
import { createWorkspaceWithOwner, addMember, getUserByEmail, issueSetupToken, issueSetupTokenForBootstrap, consumeSetupToken, verifyPassword } from "@rdv/auth";
import { AuthorizationError, NotFoundError, ValidationError } from "@rdv/lib";
import { resetDb } from "./helpers.js";

describe("Account setup / onboarding (Wave 2 Phase 0)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("an Owner can issue a setup token for an existing member", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "Onboarding WS", ownerEmail: "owner@onboard.local" });
    const owner = await getUserByEmail("owner@onboard.local");
    await addMember({ workspaceId: ws.id, actorUserId: owner.id, targetEmail: "member@onboard.local", role: "member_operator" });
    const member = await getUserByEmail("member@onboard.local");

    const issued = await issueSetupToken({ workspaceId: ws.id, actorUserId: owner.id, targetUserId: member.id });
    expect(issued.token).toBeTruthy();
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("a member_operator cannot issue a setup token (insufficient role)", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "Onboarding WS 2", ownerEmail: "owner2@onboard.local" });
    const owner = await getUserByEmail("owner2@onboard.local");
    await addMember({ workspaceId: ws.id, actorUserId: owner.id, targetEmail: "op@onboard.local", role: "member_operator" });
    await addMember({ workspaceId: ws.id, actorUserId: owner.id, targetEmail: "target@onboard.local", role: "member_operator" });
    const op = await getUserByEmail("op@onboard.local");
    const target = await getUserByEmail("target@onboard.local");

    await expect(
      issueSetupToken({ workspaceId: ws.id, actorUserId: op.id, targetUserId: target.id })
    ).rejects.toThrow(AuthorizationError);
  });

  it("rejects issuing a setup token for a non-member", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "Onboarding WS 3", ownerEmail: "owner3@onboard.local" });
    const owner = await getUserByEmail("owner3@onboard.local");
    const outsiderWs = await createWorkspaceWithOwner({ workspaceName: "Other WS", ownerEmail: "outsider@onboard.local" });
    const outsider = await getUserByEmail("outsider@onboard.local");
    expect(outsiderWs.id).not.toBe(ws.id);

    await expect(
      issueSetupToken({ workspaceId: ws.id, actorUserId: owner.id, targetUserId: outsider.id })
    ).rejects.toThrow(NotFoundError);
  });

  it("consuming a valid token sets a password that then verifies, and the token cannot be reused", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "Onboarding WS 4", ownerEmail: "owner4@onboard.local" });
    const owner = await getUserByEmail("owner4@onboard.local");
    await addMember({ workspaceId: ws.id, actorUserId: owner.id, targetEmail: "newmember@onboard.local", role: "member_operator" });
    const member = await getUserByEmail("newmember@onboard.local");

    const { token } = await issueSetupToken({ workspaceId: ws.id, actorUserId: owner.id, targetUserId: member.id });

    const result = await consumeSetupToken({ token, newPassword: "a-secure-password-123" });
    expect(result.userId).toBe(member.id);

    const verified = await verifyPassword("newmember@onboard.local", "a-secure-password-123");
    expect(verified?.userId).toBe(member.id);

    // Re-using the same (now-cleared) token must fail.
    await expect(consumeSetupToken({ token, newPassword: "another-password-456" })).rejects.toThrow(ValidationError);
  });

  it("rejects an unknown/invalid token", async () => {
    await expect(
      consumeSetupToken({ token: "not-a-real-token", newPassword: "whatever-password" })
    ).rejects.toThrow(ValidationError);
  });

  it("rejects a too-short password", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "Onboarding WS 5", ownerEmail: "owner5@onboard.local" });
    const owner = await getUserByEmail("owner5@onboard.local");
    await addMember({ workspaceId: ws.id, actorUserId: owner.id, targetEmail: "shortpw@onboard.local", role: "member_operator" });
    const member = await getUserByEmail("shortpw@onboard.local");
    const { token } = await issueSetupToken({ workspaceId: ws.id, actorUserId: owner.id, targetUserId: member.id });

    await expect(consumeSetupToken({ token, newPassword: "short" })).rejects.toThrow(ValidationError);
  });

  it("verifyPassword returns null (never throws) for an unknown email, no password set yet, or wrong password", async () => {
    expect(await verifyPassword("nobody@onboard.local", "whatever")).toBeNull();

    const ws = await createWorkspaceWithOwner({ workspaceName: "Onboarding WS 6", ownerEmail: "owner6@onboard.local" });
    // Owner exists but has never completed setup (no password_hash yet).
    expect(await verifyPassword("owner6@onboard.local", "whatever")).toBeNull();

    const owner = await getUserByEmail("owner6@onboard.local");
    await addMember({ workspaceId: ws.id, actorUserId: owner.id, targetEmail: "haspw@onboard.local", role: "member_operator" });
    const member = await getUserByEmail("haspw@onboard.local");
    const { token } = await issueSetupToken({ workspaceId: ws.id, actorUserId: owner.id, targetUserId: member.id });
    await consumeSetupToken({ token, newPassword: "correct-password-789" });

    expect(await verifyPassword("haspw@onboard.local", "wrong-password")).toBeNull();
  });

  it("issueSetupTokenForBootstrap lets a brand-new Owner (no session possible yet) get their first token", async () => {
    // This is exactly the case issueSetupToken cannot cover: a freshly
    // created Owner has no password yet, so there is no session to call
    // issueSetupToken with in the first place.
    const ws = await createWorkspaceWithOwner({ workspaceName: "Bootstrap WS", ownerEmail: "freshowner@onboard.local" });
    const owner = await getUserByEmail("freshowner@onboard.local");
    expect(owner.passwordHash).toBeNull();

    const issued = await issueSetupTokenForBootstrap("freshowner@onboard.local");
    const result = await consumeSetupToken({ token: issued.token, newPassword: "owner-bootstrap-pw-1" });
    expect(result.userId).toBe(owner.id);

    const verified = await verifyPassword("freshowner@onboard.local", "owner-bootstrap-pw-1");
    expect(verified?.userId).toBe(owner.id);
    expect(ws.id).toBeTruthy();
  });

  it("issueSetupTokenForBootstrap rejects an unknown email", async () => {
    await expect(issueSetupTokenForBootstrap("nobody-at-all@onboard.local")).rejects.toThrow();
  });

  it("an expired token is rejected", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "Onboarding WS 7", ownerEmail: "owner7@onboard.local" });
    const owner = await getUserByEmail("owner7@onboard.local");
    await addMember({ workspaceId: ws.id, actorUserId: owner.id, targetEmail: "expired@onboard.local", role: "member_operator" });
    const member = await getUserByEmail("expired@onboard.local");
    const { token } = await issueSetupToken({ workspaceId: ws.id, actorUserId: owner.id, targetUserId: member.id });

    // Simulate expiry by directly backdating the stored expiry (test-only
    // shortcut — there is no public API to do this, by design).
    const { db, schema } = await import("@rdv/db");
    const { eq } = await import("drizzle-orm");
    await db
      .update(schema.users)
      .set({ setupTokenExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.users.id, member.id));

    await expect(consumeSetupToken({ token, newPassword: "whatever-password-1" })).rejects.toThrow(ValidationError);
  });
});
