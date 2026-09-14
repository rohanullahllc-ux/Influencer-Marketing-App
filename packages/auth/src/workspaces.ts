import { eq, and, sql } from "drizzle-orm";
import { db, withWorkspace, writeAuditLog, schema } from "@rdv/db";
import { systemDb } from "@rdv/db/systemClient";
import { NotFoundError, oneOrThrow } from "@rdv/lib";
import { requireRole, type WorkspaceRole } from "./rbac.js";

const { workspaces, users, workspaceMembers } = schema;

export interface WorkspaceSummary {
  id: string;
  name: string;
  role: WorkspaceRole;
}

/**
 * Bootstraps a brand-new workspace with its first Owner. This is the one
 * legitimate use of `systemDb` (RLS-bypassing) in the whole codebase: the
 * workspace being audited/scoped does not exist until partway through this
 * function, so there is no `app.current_workspace_id` to set beforehand.
 * Everything after this call must go through the ordinary RLS-enforced
 * `db`/`withWorkspace` path.
 *
 * There is no public self-serve signup path anywhere in this codebase —
 * this function is the only way a workspace comes into existence, and it
 * is only ever invoked from an authenticated, already-privileged context
 * (an existing platform operator provisioning a new customer workspace),
 * never from an unauthenticated request handler. That satisfies the V1
 * "no public signup" requirement without needing an invite-token/email
 * flow, which is out of scope for Wave 1 Foundation.
 */
export async function createWorkspaceWithOwner(params: {
  workspaceName: string;
  ownerEmail: string;
  ownerName?: string;
}): Promise<WorkspaceSummary> {
  const { workspaceName, ownerEmail, ownerName } = params;

  return systemDb.transaction(async (tx) => {
    const owner = oneOrThrow(
      await tx
        .insert(users)
        .values({ email: ownerEmail, name: ownerName ?? null })
        .onConflictDoUpdate({
          // `set` must never be empty (drizzle throws "No values to set").
          // When no new name is given, this sets name = users.name — a
          // genuine no-op update, not a null-out of an existing name.
          target: users.email,
          set: { name: ownerName ?? sql`${users.name}` },
        })
        .returning(),
      "upsert owner user"
    );

    const workspace = oneOrThrow(
      await tx.insert(workspaces).values({ name: workspaceName }).returning(),
      "insert workspace"
    );

    await tx.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: owner.id,
      role: "owner",
    });

    await writeAuditLog(tx, {
      workspaceId: workspace.id,
      actorUserId: owner.id,
      action: "workspace.created",
      entityType: "workspace",
      entityId: workspace.id,
      metadata: { workspaceName, ownerEmail },
    });

    return { id: workspace.id, name: workspace.name, role: "owner" as const };
  });
}

/**
 * Adds an existing-or-new user to a workspace. Requires the actor to
 * already hold Admin or Owner in that workspace (checked via the
 * RLS-scoped path — no bypass needed here, unlike workspace creation,
 * because the workspace already exists and the actor's own membership row
 * is visible under normal RLS once `app.current_workspace_id` is set).
 */
export async function addMember(params: {
  workspaceId: string;
  actorUserId: string;
  targetEmail: string;
  targetName?: string;
  role: WorkspaceRole;
}): Promise<void> {
  const { workspaceId, actorUserId, targetEmail, targetName, role } = params;

  await withWorkspace(workspaceId, async (tx) => {
    const [actorMembership] = await tx
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, actorUserId)))
      .limit(1);

    requireRole(actorMembership?.role as WorkspaceRole | undefined, "admin");

    // Only owner can create another owner.
    if (role === "owner") {
      requireRole(actorMembership?.role as WorkspaceRole | undefined, "owner");
    }

    const target = oneOrThrow(
      await tx
        .insert(users)
        .values({ email: targetEmail, name: targetName ?? null })
        .onConflictDoUpdate({ target: users.email, set: { name: targetName ?? sql`${users.name}` } })
        .returning(),
      "upsert target user"
    );

    const [existingMembership] = await tx
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, target.id)))
      .limit(1);

    if (existingMembership?.role === role) {
      // No-op: already a member with this exact role. Skip the write and
      // the audit entry — an audit log exists to record what changed, and
      // logging a no-op "member_added" on every idempotent re-run would
      // make it misleading, not complete.
      return;
    }

    await tx
      .insert(workspaceMembers)
      .values({ workspaceId, userId: target.id, role })
      .onConflictDoUpdate({
        target: [workspaceMembers.workspaceId, workspaceMembers.userId],
        set: { role },
      });

    await writeAuditLog(tx, {
      workspaceId,
      actorUserId,
      action: existingMembership ? "workspace.member_role_changed" : "workspace.member_added",
      entityType: "workspace_member",
      entityId: target.id,
      metadata: existingMembership
        ? { targetEmail, fromRole: existingMembership.role, toRole: role }
        : { targetEmail, role },
    });
  });
}

/** RLS-scoped: returns the caller's own membership row for a workspace, or undefined. */
export async function getMembership(
  workspaceId: string,
  userId: string
): Promise<{ role: WorkspaceRole } | undefined> {
  return withWorkspace(workspaceId, async (tx) => {
    const [row] = await tx
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1);
    return row as { role: WorkspaceRole } | undefined;
  });
}

/**
 * Lists every workspace a user belongs to. Uses `systemDb` deliberately:
 * this is the canonical "which workspace_id do I even scope to" query — by
 * definition it cannot be answered from inside a single already-scoped
 * `withWorkspace` transaction. See systemClient.ts for why this bypass is
 * sanctioned only for cases shaped like this one.
 */
export async function listWorkspacesForUser(userId: string): Promise<WorkspaceSummary[]> {
  const rows = await systemDb
    .select({ id: workspaces.id, name: workspaces.name, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, userId));

  return rows as WorkspaceSummary[];
}

export async function getUserByEmail(email: string) {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!row) throw new NotFoundError(`No user with email ${email}`);
  return row;
}

export interface MemberSummary {
  userId: string;
  email: string;
  name: string | null;
  role: WorkspaceRole;
  hasPassword: boolean;
}

/**
 * Wave 2 Phase 0 (plan §5): lists a workspace's members with enough detail
 * for an Owner/Admin to see who still needs a setup link issued
 * (`hasPassword: false`). Never returns `password_hash`/`setup_token_hash`
 * themselves — only a boolean derived from whether one is set.
 */
export async function listMembers(workspaceId: string): Promise<MemberSummary[]> {
  return withWorkspace(workspaceId, async (tx) => {
    const rows = await tx
      .select({
        userId: users.id,
        email: users.email,
        name: users.name,
        role: workspaceMembers.role,
        passwordHash: users.passwordHash,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(workspaceMembers.userId, users.id))
      .where(eq(workspaceMembers.workspaceId, workspaceId));

    return rows.map((r) => ({
      userId: r.userId,
      email: r.email,
      name: r.name,
      role: r.role as WorkspaceRole,
      hasPassword: r.passwordHash !== null,
    }));
  });
}
