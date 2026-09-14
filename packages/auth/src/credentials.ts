import { and, eq } from "drizzle-orm";
import { withWorkspace, writeAuditLog, schema } from "@rdv/db";
import { encryptSecret, decryptSecret, ValidationError } from "@rdv/lib";
import { requireRole } from "./rbac.js";

const { integrationCredentials, credentialProviderEnum } = schema;

export type CredentialProvider = (typeof credentialProviderEnum.enumValues)[number];

export interface CredentialStatus {
  provider: CredentialProvider;
  status: "active" | "revoked" | "expired";
  rotatedAt: Date | null;
  createdAt: Date;
}

/**
 * Wave 2 Phase 0 (plan §4B, §5): stores a workspace-scoped third-party API
 * key (YouTube, Anthropic, ...), reusing Wave 1's `integration_credentials`
 * table and `encryptSecret`/`decryptSecret` exactly as built — no schema
 * change. Plaintext is encrypted before this function's own caller (the
 * API route) ever constructs a DB statement; it is never logged (pino
 * redaction also covers `apiKey`/`secret` field names as a second layer)
 * and never returned by any read path in this module.
 *
 * If an active credential already exists for this provider, it is marked
 * `revoked` (with `rotatedAt` set) in the same transaction as the new
 * row's insert — there is at most one `active` row per
 * (workspace, provider) at any time, but history is preserved rather than
 * overwritten in place.
 */
export async function storeCredential(params: {
  workspaceId: string;
  actorUserId: string;
  provider: CredentialProvider;
  apiKey: string;
}): Promise<void> {
  const { workspaceId, actorUserId, provider, apiKey } = params;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new ValidationError("apiKey must not be empty");
  }

  await withWorkspace(workspaceId, async (tx) => {
    const [actorMembership] = await tx
      .select()
      .from(schema.workspaceMembers)
      .where(eq(schema.workspaceMembers.userId, actorUserId));
    requireRole(actorMembership?.role, "admin");

    const now = new Date();
    await tx
      .update(integrationCredentials)
      .set({ status: "revoked", rotatedAt: now })
      .where(
        and(
          eq(integrationCredentials.workspaceId, workspaceId),
          eq(integrationCredentials.provider, provider),
          eq(integrationCredentials.status, "active")
        )
      );

    const encrypted = encryptSecret(apiKey);
    await tx.insert(integrationCredentials).values({
      workspaceId,
      provider,
      status: "active",
      encryptedIv: encrypted.iv,
      encryptedAuthTag: encrypted.authTag,
      encryptedCiphertext: encrypted.ciphertext,
    });

    await writeAuditLog(tx, {
      workspaceId,
      actorUserId,
      action: "credential.stored",
      entityType: "integration_credential",
      entityId: provider,
      metadata: { provider }, // never the key itself
    });
  });
}

/** Owner/Admin-only status list — never exposes the encrypted payload. */
export async function getCredentialStatus(params: {
  workspaceId: string;
  actorUserId: string;
}): Promise<CredentialStatus[]> {
  const { workspaceId, actorUserId } = params;

  return withWorkspace(workspaceId, async (tx) => {
    const [actorMembership] = await tx
      .select()
      .from(schema.workspaceMembers)
      .where(eq(schema.workspaceMembers.userId, actorUserId));
    requireRole(actorMembership?.role, "admin");

    const rows = await tx
      .select({
        provider: integrationCredentials.provider,
        status: integrationCredentials.status,
        rotatedAt: integrationCredentials.rotatedAt,
        createdAt: integrationCredentials.createdAt,
      })
      .from(integrationCredentials)
      .where(eq(integrationCredentials.workspaceId, workspaceId));

    return rows;
  });
}

/**
 * Internal reader used by background jobs (YouTube discovery) and
 * `packages/ai`'s Anthropic client — never exposed via an API route.
 * Callers already operate within an established workspace context (a job's
 * `workspaceId`); this intentionally has no `requireRole` check of its own
 * since that check already happened when the human triggered the
 * job/action that led here.
 */
export async function getDecryptedCredential(params: {
  workspaceId: string;
  provider: CredentialProvider;
}): Promise<string | null> {
  const { workspaceId, provider } = params;

  return withWorkspace(workspaceId, async (tx) => {
    const [row] = await tx
      .select()
      .from(integrationCredentials)
      .where(
        and(
          eq(integrationCredentials.workspaceId, workspaceId),
          eq(integrationCredentials.provider, provider),
          eq(integrationCredentials.status, "active")
        )
      )
      .limit(1);

    if (!row) return null;

    return decryptSecret({
      iv: row.encryptedIv,
      authTag: row.encryptedAuthTag,
      ciphertext: row.encryptedCiphertext,
    });
  });
}
