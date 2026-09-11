import type { db as DbType } from "./client.js";
import { auditLog } from "./schema.js";

type Executor = { insert: typeof DbType["insert"] };

export interface AuditEntry {
  workspaceId: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Append-only audit log write (Step 5 §5.1 acceptance criterion: "every
 * privileged action — workspace creation, membership/role change, credential
 * add/rotate/revoke — has a corresponding audit_log row"). No update/delete
 * helper exists on purpose: the audit log is append-only by convention (not
 * yet DB-enforced via a REVOKE UPDATE/DELETE — tracked as a Wave 6
 * hardening item, not a Wave 1 blocker, since only this codebase's own
 * queries touch the table today).
 *
 * `executor` must already be scoped correctly for the row being written:
 * pass a `withWorkspace`-opened `tx` for ordinary workspace-scoped actions,
 * or `systemDb` only for the narrow bootstrap paths in packages/auth that
 * legitimately bypass RLS (e.g. workspace creation, where the workspace_id
 * being audited is the one just created in the same transaction).
 */
export async function writeAuditLog(executor: Executor, entry: AuditEntry): Promise<void> {
  await executor.insert(auditLog).values({
    workspaceId: entry.workspaceId,
    actorUserId: entry.actorUserId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    metadata: entry.metadata ?? {},
  });
}
