import { describe, it, expect, beforeEach } from "vitest";
import { createWorkspaceWithOwner, addMember, getUserByEmail, storeCredential, getCredentialStatus, getDecryptedCredential } from "@rdv/auth";
import { AuthorizationError, ValidationError } from "@rdv/lib";
import { resetDb } from "./helpers.js";

describe("Workspace-scoped integration credentials (Wave 2 Phase 0)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("an Admin can store a credential and it round-trips through encryption", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "Cred WS", ownerEmail: "owner@cred.local" });
    const owner = await getUserByEmail("owner@cred.local");

    await storeCredential({ workspaceId: ws.id, actorUserId: owner.id, provider: "youtube", apiKey: "yt-secret-key-123" });

    const decrypted = await getDecryptedCredential({ workspaceId: ws.id, provider: "youtube" });
    expect(decrypted).toBe("yt-secret-key-123");
  });

  it("status listing never exposes the encrypted payload fields", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "Cred WS 2", ownerEmail: "owner2@cred.local" });
    const owner = await getUserByEmail("owner2@cred.local");
    await storeCredential({ workspaceId: ws.id, actorUserId: owner.id, provider: "deepseek", apiKey: "deepseek-secret-456" });

    const statuses = await getCredentialStatus({ workspaceId: ws.id, actorUserId: owner.id });
    expect(statuses).toHaveLength(1);
    expect(statuses[0]?.provider).toBe("deepseek");
    expect(statuses[0]?.status).toBe("active");
    expect(statuses[0]).not.toHaveProperty("encryptedCiphertext");
    expect(statuses[0]).not.toHaveProperty("apiKey");
  });

  it("a member_operator cannot store or view credentials (insufficient role)", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "Cred WS 3", ownerEmail: "owner3@cred.local" });
    const owner = await getUserByEmail("owner3@cred.local");
    await addMember({ workspaceId: ws.id, actorUserId: owner.id, targetEmail: "op@cred.local", role: "member_operator" });
    const op = await getUserByEmail("op@cred.local");

    await expect(
      storeCredential({ workspaceId: ws.id, actorUserId: op.id, provider: "youtube", apiKey: "should-not-work" })
    ).rejects.toThrow(AuthorizationError);
    await expect(getCredentialStatus({ workspaceId: ws.id, actorUserId: op.id })).rejects.toThrow(AuthorizationError);
  });

  it("storing a new key for the same provider revokes the previous active one instead of overwriting it", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "Cred WS 4", ownerEmail: "owner4@cred.local" });
    const owner = await getUserByEmail("owner4@cred.local");

    await storeCredential({ workspaceId: ws.id, actorUserId: owner.id, provider: "youtube", apiKey: "first-key" });
    await storeCredential({ workspaceId: ws.id, actorUserId: owner.id, provider: "youtube", apiKey: "second-key" });

    const statuses = await getCredentialStatus({ workspaceId: ws.id, actorUserId: owner.id });
    const youtubeRows = statuses.filter((s) => s.provider === "youtube");
    expect(youtubeRows).toHaveLength(2);
    expect(youtubeRows.filter((r) => r.status === "active")).toHaveLength(1);
    expect(youtubeRows.filter((r) => r.status === "revoked")).toHaveLength(1);

    const decrypted = await getDecryptedCredential({ workspaceId: ws.id, provider: "youtube" });
    expect(decrypted).toBe("second-key");
  });

  it("rejects an empty apiKey", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "Cred WS 5", ownerEmail: "owner5@cred.local" });
    const owner = await getUserByEmail("owner5@cred.local");

    await expect(
      storeCredential({ workspaceId: ws.id, actorUserId: owner.id, provider: "youtube", apiKey: "" })
    ).rejects.toThrow(ValidationError);
  });

  it("getDecryptedCredential returns null when no credential has been stored for a provider", async () => {
    const ws = await createWorkspaceWithOwner({ workspaceName: "Cred WS 6", ownerEmail: "owner6@cred.local" });
    const decrypted = await getDecryptedCredential({ workspaceId: ws.id, provider: "deepseek" });
    expect(decrypted).toBeNull();
  });
});
