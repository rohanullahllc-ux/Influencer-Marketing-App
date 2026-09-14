import { and, desc, eq } from "drizzle-orm";
import { withWorkspace, writeAuditLog, schema } from "@rdv/db";
import { requireRole } from "@rdv/auth";
import { ValidationError, oneOrThrow } from "@rdv/lib";
import type { Suppression } from "./entities.js";

const { suppressions, workspaceMembers } = schema;

/**
 * Wave 2 Phase 7 (plan §12, §14.7): durable, workspace-scoped suppression
 * / do-not-contact list, keyed to a normalized contact identity — not a
 * creator FK, so it survives creator-record merges. A suppression is
 * never deleted here (no delete function exists — durable by absence,
 * same "enforced by absence" convention as the rest of Wave 2).
 */

export function normalizeIdentity(identity: string): string {
  return identity.trim().toLowerCase();
}

async function requireActorRole(
  tx: Parameters<Parameters<typeof withWorkspace>[1]>[0],
  actorUserId: string,
  minimum: "member_operator" | "admin" | "owner"
): Promise<void> {
  const [actorMembership] = await tx.select().from(workspaceMembers).where(eq(workspaceMembers.userId, actorUserId));
  requireRole(actorMembership?.role, minimum);
}

export async function addSuppression(params: {
  workspaceId: string;
  actorUserId: string;
  identity: string;
  reason?: string | null;
}): Promise<Suppression> {
  const { workspaceId, actorUserId, identity, reason } = params;
  if (!identity || identity.trim().length === 0) {
    throw new ValidationError("identity is required");
  }

  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");

    const normalized = normalizeIdentity(identity);
    const row = oneOrThrow(
      await tx
        .insert(suppressions)
        .values({ workspaceId, normalizedIdentity: normalized, reason: reason ?? null, createdBy: actorUserId })
        .returning(),
      "insert suppression"
    );

    await writeAuditLog(tx, {
      workspaceId,
      actorUserId,
      action: "suppression.added",
      entityType: "suppression",
      entityId: row.id,
      metadata: { normalizedIdentity: normalized },
    });

    return row;
  });
}

export async function listSuppressions(params: { workspaceId: string; actorUserId: string }): Promise<Suppression[]> {
  const { workspaceId, actorUserId } = params;
  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");
    return tx.select().from(suppressions).where(eq(suppressions.workspaceId, workspaceId)).orderBy(desc(suppressions.createdAt));
  });
}

/** Called by the dry-run evaluator (and available for any future real send path) — no role check, a pure lookup used internally. */
export async function isSuppressed(params: { workspaceId: string; identity: string | null }): Promise<boolean> {
  const { workspaceId, identity } = params;
  if (!identity) return false;

  const normalized = normalizeIdentity(identity);
  return withWorkspace(workspaceId, async (tx) => {
    const [row] = await tx
      .select()
      .from(suppressions)
      .where(and(eq(suppressions.workspaceId, workspaceId), eq(suppressions.normalizedIdentity, normalized)))
      .limit(1);
    return Boolean(row);
  });
}
