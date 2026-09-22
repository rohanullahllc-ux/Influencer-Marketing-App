import { and, eq } from "drizzle-orm";
import { withWorkspace, schema } from "@rdv/db";

const { providerMailboxState } = schema;

/**
 * Wave 3: generic sync-cursor/watch-expiry bookkeeping for the
 * reconciliation-polling backstop (product vision: "webhook-primary with
 * reconciliation polling as backstop"). Deliberately provider-agnostic —
 * a real Gmail adapter would store its `historyId` in `syncCursor` and its
 * watch renewal deadline in `watchExpiresAt`; this module doesn't know or
 * care which provider is active.
 */
export async function recordMailboxSync(params: {
  workspaceId: string;
  provider: string;
  syncCursor?: string | null;
  watchExpiresAt?: Date | null;
}): Promise<void> {
  const { workspaceId, provider, syncCursor, watchExpiresAt } = params;

  await withWorkspace(workspaceId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(providerMailboxState)
      .where(and(eq(providerMailboxState.workspaceId, workspaceId), eq(providerMailboxState.provider, provider)))
      .limit(1);

    if (existing) {
      await tx
        .update(providerMailboxState)
        .set({
          lastSyncedAt: new Date(),
          ...(syncCursor !== undefined ? { syncCursor } : {}),
          ...(watchExpiresAt !== undefined ? { watchExpiresAt } : {}),
        })
        .where(eq(providerMailboxState.id, existing.id));
      return;
    }

    await tx.insert(providerMailboxState).values({
      workspaceId,
      provider,
      lastSyncedAt: new Date(),
      syncCursor: syncCursor ?? null,
      watchExpiresAt: watchExpiresAt ?? null,
    });
  });
}

export async function getMailboxSyncState(params: {
  workspaceId: string;
  provider: string;
}): Promise<{ syncCursor: string | null; watchExpiresAt: Date | null; lastSyncedAt: Date | null } | null> {
  const { workspaceId, provider } = params;
  return withWorkspace(workspaceId, async (tx) => {
    const [row] = await tx
      .select()
      .from(providerMailboxState)
      .where(and(eq(providerMailboxState.workspaceId, workspaceId), eq(providerMailboxState.provider, provider)))
      .limit(1);
    if (!row) return null;
    return { syncCursor: row.syncCursor, watchExpiresAt: row.watchExpiresAt, lastSyncedAt: row.lastSyncedAt };
  });
}
