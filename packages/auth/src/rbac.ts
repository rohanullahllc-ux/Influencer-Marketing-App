import { AuthorizationError } from "@rdv/lib";

/**
 * Role hierarchy (Step 5 §5.1 / Step 6: Owner / Admin / Member-Operator).
 * Higher index = more privilege. This is the single source of truth for
 * "does role X satisfy a requirement of at least role Y" — every
 * app-layer authorization check in the codebase must go through
 * `requireRole`/`hasRole` rather than comparing role strings ad hoc.
 */
export const ROLE_RANK = {
  member_operator: 0,
  admin: 1,
  owner: 2,
} as const;

export type WorkspaceRole = keyof typeof ROLE_RANK;

export function hasRole(actual: WorkspaceRole, minimum: WorkspaceRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[minimum];
}

/**
 * Throws AuthorizationError if `actual` does not satisfy `minimum`. This
 * is the app-layer authorization check that must accompany every RLS
 * policy per the Step 5 acceptance criterion — RLS alone is never
 * sufficient, since RLS enforces *tenant* isolation, not *role* rules
 * within a tenant (e.g. RLS lets any workspace member SELECT
 * workspace_members rows for their workspace; only `requireRole` stops a
 * member_operator from inserting a new owner).
 */
export function requireRole(actual: WorkspaceRole | undefined, minimum: WorkspaceRole): void {
  if (!actual || !hasRole(actual, minimum)) {
    throw new AuthorizationError(
      `Requires role >= ${minimum}, actor has ${actual ?? "no membership"}`
    );
  }
}
