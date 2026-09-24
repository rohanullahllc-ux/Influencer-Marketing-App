import { and, eq, ne } from "drizzle-orm";
import { withWorkspace, schema } from "@rdv/db";

const { outreachSends } = schema;

/**
 * Wave 3: shared by both dryRun.ts (preview) and outreachSend.ts (real
 * execution) so a dry run's cross-campaign preview and the real safety
 * gate always agree. True when this recipient identity already has a
 * *real, confirmed* send (`status = 'sent'`) under a different campaign in
 * this workspace — a merely scheduled/pending send elsewhere doesn't
 * trigger this (nothing has actually reached them yet), matching the
 * product vision's intent: don't let two campaigns silently double-
 * contact the same person once one of them already has.
 */
export async function hasActiveCrossCampaignContact(
  tx: Parameters<Parameters<typeof withWorkspace>[1]>[0],
  params: { workspaceId: string; campaignId: string; recipientIdentity: string | null }
): Promise<boolean> {
  const { workspaceId, campaignId, recipientIdentity } = params;
  if (!recipientIdentity) return false;

  const normalized = recipientIdentity.trim().toLowerCase();
  const rows = await tx
    .select({ id: outreachSends.id })
    .from(outreachSends)
    .where(
      and(
        eq(outreachSends.workspaceId, workspaceId),
        eq(outreachSends.recipientIdentity, normalized),
        eq(outreachSends.status, "sent"),
        ne(outreachSends.campaignId, campaignId)
      )
    )
    .limit(1);

  return rows.length > 0;
}
