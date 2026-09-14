import { listCampaigns } from "@rdv/domain";
import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../lib/session";

/** Wave 2 Phase 4 (plan §9): campaign list, the entry point into Campaign + Templates. */
export default async function CampaignsPage() {
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

  const campaigns = await listCampaigns({ workspaceId: actor.workspaceId, actorUserId: actor.userId });

  return (
    <main style={{ padding: 32, maxWidth: 720 }}>
      <h1>Campaigns</h1>
      <p style={{ marginBottom: 16 }}>
        <a href="/campaigns/new">+ New campaign</a> · <a href="/templates">Manage templates</a>
      </p>
      {campaigns.length === 0 ? (
        <p style={{ color: "#666" }}>No campaigns yet.</p>
      ) : (
        <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
              <th>Name</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id} style={{ borderBottom: "1px solid #eee" }}>
                <td>
                  <a href={`/campaigns/${c.id}`}>{c.name}</a>
                </td>
                <td>{c.status}</td>
                <td>{new Date(c.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
