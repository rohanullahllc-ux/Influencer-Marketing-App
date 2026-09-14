import type { WorkspaceRole } from "@rdv/auth";

// Module augmentation for Auth.js's Session shape — adds the Wave 2 Phase 0
// actor/workspace fields our session/jwt callbacks in ../auth.ts populate.
declare module "next-auth" {
  interface Session {
    userId: string;
    currentWorkspaceId: string | undefined;
    currentWorkspaceRole: WorkspaceRole | undefined;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    workspaces?: Array<{ id: string; name: string; role: WorkspaceRole }>;
    currentWorkspaceId?: string;
  }
}
