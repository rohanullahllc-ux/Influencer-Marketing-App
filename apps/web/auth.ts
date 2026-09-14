import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifyPassword, listWorkspacesForUser, type WorkspaceSummary, type WorkspaceRole } from "@rdv/auth";

/**
 * Wave 2 Phase 0 (plan §5): minimal real session layer. JWT strategy (no
 * Account/Session/VerificationToken tables — the simplest option
 * consistent with the architecture). The Credentials provider delegates
 * entirely to @rdv/auth's `verifyPassword`; this file has no password
 * logic of its own.
 *
 * Workspace selection: a signed-in user's available workspaces are loaded
 * once at login via the existing `listWorkspacesForUser` and stored on the
 * token. `currentWorkspaceId` defaults to the workspace where the user
 * holds their highest role (ties broken by whichever `listWorkspacesForUser`
 * returned first) — correct and sufficient for Wave 2, where RDV operates
 * a single workspace. A multi-workspace switcher UI is not built in this
 * phase; noted as a known limitation, not a silent gap (see Phase 0
 * report).
 */
const ROLE_PRIORITY: Record<WorkspaceRole, number> = { owner: 2, admin: 1, member_operator: 0 };

function pickDefaultWorkspace(workspaces: WorkspaceSummary[]): WorkspaceSummary | undefined {
  return [...workspaces].sort((a, b) => ROLE_PRIORITY[b.role] - ROLE_PRIORITY[a.role])[0];
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = typeof credentials?.email === "string" ? credentials.email : undefined;
        const password = typeof credentials?.password === "string" ? credentials.password : undefined;
        if (!email || !password) return null;

        const result = await verifyPassword(email, password);
        if (!result) return null;

        return { id: result.userId, email };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Only re-derive workspace membership at sign-in (when `user` is
      // present) — not on every token refresh, to avoid a DB round trip
      // per request. A membership change takes effect on next sign-in.
      if (user?.id) {
        token.userId = user.id;
        const workspaces = await listWorkspacesForUser(user.id);
        token.workspaces = workspaces;
        token.currentWorkspaceId = pickDefaultWorkspace(workspaces)?.id;
      }
      return token;
    },
    async session({ session, token }) {
      const workspaces = (token.workspaces as WorkspaceSummary[] | undefined) ?? [];
      const currentWorkspaceId = token.currentWorkspaceId as string | undefined;
      session.userId = token.userId as string;
      session.currentWorkspaceId = currentWorkspaceId;
      session.currentWorkspaceRole = workspaces.find((w) => w.id === currentWorkspaceId)?.role;
      return session;
    },
  },
});
