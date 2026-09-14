import { listTemplates } from "@rdv/domain";
import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../lib/session";

/** Wave 2 Phase 4 (plan §9): outreach template list. */
export default async function TemplatesPage() {
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

  const templates = await listTemplates({ workspaceId: actor.workspaceId, actorUserId: actor.userId });

  return (
    <main style={{ padding: 32, maxWidth: 720 }}>
      <h1>Templates</h1>
      <p style={{ marginBottom: 16 }}>
        <a href="/templates/new">+ New template</a>
      </p>
      {templates.length === 0 ? (
        <p style={{ color: "#666" }}>No templates yet.</p>
      ) : (
        <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
              <th>Name</th>
              <th>Subject</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id} style={{ borderBottom: "1px solid #eee" }}>
                <td>
                  <a href={`/templates/${t.id}`}>{t.name}</a>
                </td>
                <td>{t.subject ?? "—"}</td>
                <td>{t.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
