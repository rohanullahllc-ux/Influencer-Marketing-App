import { auth } from "../auth";
import { AuthorizationError } from "@rdv/lib";
import type { WorkspaceRole } from "@rdv/auth";

export interface CurrentActor {
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
}

/**
 * Resolves the authenticated actor + their current workspace/role from the
 * Auth.js session for use in API route handlers. Every Wave 2 route that
 * touches workspace data must call this first — never trust a
 * client-supplied workspaceId/userId (plan §15).
 */
export async function requireSession(): Promise<CurrentActor> {
  const session = await auth();
  if (!session?.userId || !session.currentWorkspaceId || !session.currentWorkspaceRole) {
    throw new AuthorizationError("Not authenticated");
  }
  return {
    userId: session.userId,
    workspaceId: session.currentWorkspaceId,
    role: session.currentWorkspaceRole,
  };
}
