import { listCreators } from "@rdv/domain";
import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../../lib/session";
import { ManualCreatorForm } from "./ManualCreatorForm";

/** Wave 2 Phase 3 (plan §8): all creators in the workspace — YouTube-discovered and manually entered — plus the manual-add form. */
export default async function CreatorsPage() {
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

  const creators = await listCreators({ workspaceId: actor.workspaceId, actorUserId: actor.userId });

  return (
    <main style={{ padding: 32, maxWidth: 900 }}>
      <h1>Creators</h1>

      {creators.length === 0 ? (
        <p style={{ color: "#666" }}>No creators yet — run discovery from a product page, or add one manually below.</p>
      ) : (
        <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%", marginBottom: 32 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
              <th>Name</th>
              <th>Platform</th>
              <th>Provenance</th>
              <th>Subscribers</th>
              <th>Country</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {creators.map((c) => (
              <tr key={c.id} style={{ borderBottom: "1px solid #eee" }}>
                <td>
                  <a href={`/creators/${c.id}`}>{c.displayName ?? c.channelUrl ?? c.id}</a>
                </td>
                <td>{c.platform}</td>
                <td>{c.provenance}</td>
                <td>{c.subscriberCount ?? "—"}</td>
                <td>{c.country ?? "—"}</td>
                <td>{c.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Add a creator manually</h2>
      <ManualCreatorForm />
    </main>
  );
}
