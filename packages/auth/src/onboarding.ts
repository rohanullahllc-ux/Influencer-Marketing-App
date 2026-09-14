import { eq } from "drizzle-orm";
import { db, writeAuditLog, withWorkspace, schema } from "@rdv/db";
import {
  hashPassword,
  verifyPasswordHash,
  generateSetupToken,
  hashSetupToken,
  setupTokenHashesMatch,
  isSetupTokenExpired,
  NotFoundError,
  ValidationError,
} from "@rdv/lib";
import { requireRole } from "./rbac.js";
import { getMembership, listWorkspacesForUser } from "./workspaces.js";

const { users } = schema;

/**
 * Wave 2 Phase 0 (plan §5): one-time account-setup provisioning. Replaces
 * "Owner permanently knows everyone's password" with "Owner/Admin issues a
 * single-use link; the member sets their own password; the Owner/Admin
 * never learns it." No transactional email provider exists yet (see
 * docs/DECISIONS.md D1), so the raw token is returned to the caller once
 * and must be relayed out-of-band — it is never persisted anywhere except
 * as a hash on the target user's row.
 */
export interface IssuedSetupToken {
  token: string;
  expiresAt: Date;
}

export async function issueSetupToken(params: {
  workspaceId: string;
  actorUserId: string;
  targetUserId: string;
}): Promise<IssuedSetupToken> {
  const { workspaceId, actorUserId, targetUserId } = params;

  // requireRole via the actor's *own* membership — mirrors addMember's
  // pattern exactly (packages/auth/src/workspaces.ts).
  await withWorkspace(workspaceId, async (tx) => {
    const [actorMembership] = await tx
      .select()
      .from(schema.workspaceMembers)
      .where(eq(schema.workspaceMembers.userId, actorUserId));
    requireRole(actorMembership?.role, "admin");
  });

  // The target must actually be a member of this workspace — issuing a
  // setup token for an outsider would be a privilege-escalation bug.
  const targetMembership = await getMembership(workspaceId, targetUserId);
  if (!targetMembership) {
    throw new NotFoundError(`User ${targetUserId} is not a member of this workspace`);
  }

  const { token, tokenHash, expiresAt } = generateSetupToken();

  await db
    .update(users)
    .set({ setupTokenHash: tokenHash, setupTokenExpiresAt: expiresAt })
    .where(eq(users.id, targetUserId));

  await withWorkspace(workspaceId, (tx) =>
    writeAuditLog(tx, {
      workspaceId,
      actorUserId,
      action: "workspace.member_setup_token_issued",
      entityType: "user",
      entityId: targetUserId,
      metadata: {}, // never the token itself
    })
  );

  return { token, expiresAt };
}

/**
 * DANGER — bootstrap-only escape hatch, same trust tier as
 * `@rdv/db/systemClient` and `createWorkspaceWithOwner`: it issues a setup
 * token with NO actor/role check, because it exists for exactly one case
 * `issueSetupToken` structurally cannot cover — the very first Owner of a
 * newly created workspace has no password yet and therefore no session to
 * issue their own token with (the same bootstrap problem D2 solved for
 * workspace creation itself). Callable only from `scripts/issue-setup-
 * token.ts` (an operator with direct server/DB access, the same trust
 * level as `seed-dev.ts`) — never wire this to an HTTP route.
 */
export async function issueSetupTokenForBootstrap(email: string): Promise<IssuedSetupToken> {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!row) {
    throw new NotFoundError(`No user with email ${email}`);
  }

  const { token, tokenHash, expiresAt } = generateSetupToken();

  await db.update(users).set({ setupTokenHash: tokenHash, setupTokenExpiresAt: expiresAt }).where(eq(users.id, row.id));

  // Best-effort audit trail against every workspace this user belongs to —
  // actorUserId is null (system-initiated), mirroring audit_log's nullable
  // actor column, used the same way when a user is later removed.
  const memberships = await listWorkspacesForUser(row.id);
  for (const ws of memberships) {
    await withWorkspace(ws.id, (tx) =>
      writeAuditLog(tx, {
        workspaceId: ws.id,
        actorUserId: null,
        action: "workspace.member_setup_token_issued_bootstrap",
        entityType: "user",
        entityId: row.id,
        metadata: {},
      })
    );
  }

  return { token, expiresAt };
}

/**
 * Consumes a one-time setup token: verifies it (via its deterministic hash
 * — see @rdv/lib setupToken.ts for why this differs from bcrypt), sets the
 * member's own chosen password, and invalidates the token. Runs
 * pre-session (there is no actor yet — the caller IS establishing their
 * first credential), so it looks the user up by token hash rather than by
 * an authenticated identity.
 */
export async function consumeSetupToken(params: {
  token: string;
  newPassword: string;
}): Promise<{ userId: string }> {
  const { token, newPassword } = params;
  if (!newPassword || newPassword.length < 8) {
    throw new ValidationError("Password must be at least 8 characters");
  }

  const tokenHash = hashSetupToken(token);
  const [row] = await db.select().from(users).where(eq(users.setupTokenHash, tokenHash)).limit(1);

  if (!row || !row.setupTokenHash || !row.setupTokenExpiresAt) {
    throw new ValidationError("Invalid or already-used setup token");
  }
  if (!setupTokenHashesMatch(tokenHash, row.setupTokenHash)) {
    throw new ValidationError("Invalid or already-used setup token");
  }
  if (isSetupTokenExpired(row.setupTokenExpiresAt)) {
    throw new ValidationError("Setup token has expired");
  }

  const passwordHash = await hashPassword(newPassword);

  await db
    .update(users)
    .set({ passwordHash, setupTokenHash: null, setupTokenExpiresAt: null })
    .where(eq(users.id, row.id));

  return { userId: row.id };
}

/**
 * Verifies an email+password login attempt. Returns null (never throws)
 * on any failure reason — unknown email, no password set yet (setup not
 * completed), or wrong password — so the caller (the Auth.js Credentials
 * provider) can give a single generic "invalid credentials" response
 * without distinguishing *why*, which would leak account existence.
 */
export async function verifyPassword(
  email: string,
  plaintextPassword: string
): Promise<{ userId: string } | null> {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!row || !row.passwordHash) return null;

  const matches = await verifyPasswordHash(plaintextPassword, row.passwordHash);
  if (!matches) return null;

  return { userId: row.id };
}
