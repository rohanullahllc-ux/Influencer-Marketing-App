import { listMembers } from "@rdv/auth";
import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../../../lib/session";
import { IssueSetupTokenButton } from "./IssueSetupTokenButton";

/**
 * Wave 2 Phase 0 (plan §5): Owner/Admin view of workspace members, with a
 * per-member action to issue a one-time setup link for anyone who hasn't
 * completed account setup yet (`hasPassword: false`).
 */
export default async function MembersPage() {
  let actor;
  try {
    actor = await requireSession();
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return (
        <main style={{ padding: 32 }}>
          <p>
            You must <a href="/login">sign in</a> to view this page.
          </p>
        </main>
      );
    }
    throw err;
  }

  const members = await listMembers(actor.workspaceId);
  const canManage = actor.role === "owner" || actor.role === "admin";

  return (
    <main style={{ padding: 32, maxWidth: 720 }}>
      <h1>Workspace members</h1>
      <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
            <th>Email</th>
            <th>Name</th>
            <th>Role</th>
            <th>Account status</th>
            {canManage && <th></th>}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.userId} style={{ borderBottom: "1px solid #eee" }}>
              <td>{m.email}</td>
              <td>{m.name ?? "—"}</td>
              <td>{m.role}</td>
              <td>{m.hasPassword ? "Active" : "Setup required"}</td>
              {canManage && (
                <td>
                  {!m.hasPassword && <IssueSetupTokenButton userId={m.userId} email={m.email} />}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!canManage && (
        <p style={{ color: "#666", fontSize: 14, marginTop: 16 }}>
          Only an Owner/Admin can issue setup links.
        </p>
      )}
    </main>
  );
}
