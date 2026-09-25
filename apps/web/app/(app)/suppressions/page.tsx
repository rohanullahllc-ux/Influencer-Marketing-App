import { listSuppressions } from "@rdv/domain";
import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../../lib/session";
import { AddSuppressionForm } from "./AddSuppressionForm";

/** Wave 2 Phase 7 (plan §12): the workspace's durable suppression/DNC list. */
export default async function SuppressionsPage() {
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

  const suppressions = await listSuppressions({ workspaceId: actor.workspaceId, actorUserId: actor.userId });

  return (
    <main style={{ padding: 32, maxWidth: 640 }}>
      <h1>Suppressions</h1>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>
        Durable, workspace-scoped do-not-contact list. A suppressed identity always blocks outreach in the dry-run safety gate,
        regardless of approval status. Entries cannot be removed from this screen.
      </p>
      {suppressions.length === 0 ? (
        <p style={{ color: "#666" }}>No suppressions yet.</p>
      ) : (
        <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%", marginBottom: 24 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
              <th>Identity</th>
              <th>Reason</th>
              <th>Added</th>
            </tr>
          </thead>
          <tbody>
            {suppressions.map((s) => (
              <tr key={s.id} style={{ borderBottom: "1px solid #eee" }}>
                <td>{s.normalizedIdentity}</td>
                <td>{s.reason ?? "—"}</td>
                <td>{new Date(s.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h2>Add a suppression</h2>
      <AddSuppressionForm />
    </main>
  );
}
