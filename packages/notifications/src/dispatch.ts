import { eq, and, isNull, desc } from "drizzle-orm";
import { withWorkspace, schema } from "@rdv/db";
import { getLogger, oneOrThrow } from "@rdv/lib";

const { notifications } = schema;
const log = getLogger({ module: "notifications:dispatch" });

export type NotificationType =
  | "stub_test"
  | "creator_replied"
  | "creator_interested"
  | "needs_human_review"
  | "task_waiting";

export type NotificationChannel = "in_app" | "email";

export interface DispatchNotificationParams {
  workspaceId: string;
  userId: string;
  type: NotificationType;
  channel: NotificationChannel;
  payload?: Record<string, unknown>;
}

/**
 * Foundation notification dispatch (Step 5C.3.3 / 5D.5: reusable
 * infrastructure now, wired to real business events — creator replied,
 * Interested, Needs Human Review, meaningful task waiting — starting in
 * Reply Intelligence / Creator CRM waves). This module only knows how to
 * durably record and later deliver a notification; it has zero knowledge
 * of *when* one should be sent — that decision belongs to the feature
 * code that calls it once those features exist. Deliberately excludes
 * technical/operational alerts (job failures, provider outages) — those
 * are a separate Operations-surface concern (Wave 6), not a business
 * notification.
 *
 * `channel: "email"` records the delivery intent now; actually sending
 * email is out of scope for Wave 1 (no transactional email provider is
 * wired yet — see docs/DECISIONS.md D1) and is a later-wave/deployment
 * task. `in_app` is fully functional today via `listUnread`.
 */
export async function dispatchNotification(params: DispatchNotificationParams): Promise<string> {
  const { workspaceId, userId, type, channel, payload } = params;

  const id = await withWorkspace(workspaceId, async (tx) => {
    const row = oneOrThrow(
      await tx
        .insert(notifications)
        .values({ workspaceId, userId, type, channel, payload: payload ?? {} })
        .returning({ id: notifications.id }),
      "insert notification"
    );
    return row.id;
  });

  log.info({ workspaceId, userId, type, channel, notificationId: id }, "notification dispatched");
  return id;
}

export async function listUnread(workspaceId: string, userId: string) {
  return withWorkspace(workspaceId, (tx) =>
    tx
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
      .orderBy(desc(notifications.createdAt))
  );
}

export async function markRead(workspaceId: string, notificationId: string): Promise<void> {
  await withWorkspace(workspaceId, (tx) =>
    tx.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, notificationId))
  );
}
