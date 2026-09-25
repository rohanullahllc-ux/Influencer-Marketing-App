import { auth } from "../../auth";
import { listWorkspacesForUser } from "@rdv/auth";
import { AppShell, type ShellUser } from "../../components/shell/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  let user: ShellUser | null = null;

  if (session?.userId && session.currentWorkspaceId && session.currentWorkspaceRole && session.user?.email) {
    const workspaces = await listWorkspacesForUser(session.userId);
    const current = workspaces.find((w) => w.id === session.currentWorkspaceId);
    user = {
      email: session.user.email,
      workspaceName: current?.name ?? "Workspace",
      role: session.currentWorkspaceRole,
    };
  }

  return <AppShell user={user}>{children}</AppShell>;
}
