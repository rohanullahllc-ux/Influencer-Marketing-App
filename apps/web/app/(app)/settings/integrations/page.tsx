import { getCredentialStatus } from "@rdv/auth";
import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../../../lib/session";
import { AddCredentialForm } from "./AddCredentialForm";

/**
 * Wave 2 Phase 0 (plan §4B, §5): Owner/Admin screen to store the YouTube
 * and Anthropic API keys Phase 3/5/6 will need. The key itself is never
 * rendered back — only provider/status/rotatedAt, exactly what
 * `getCredentialStatus` returns.
 */
export default async function IntegrationsPage() {
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

  if (actor.role !== "owner" && actor.role !== "admin") {
    return (
      <main style={{ padding: 32 }}>
        <p>Only an Owner/Admin can manage integration credentials.</p>
      </main>
    );
  }

  const statuses = await getCredentialStatus({ workspaceId: actor.workspaceId, actorUserId: actor.userId });

  return (
    <main style={{ padding: 32, maxWidth: 640 }}>
      <h1>Integrations</h1>
      <p style={{ color: "#666", fontSize: 14 }}>
        Keys are encrypted before storage (AES-256-GCM) and never displayed again after entry.
        YouTube discovery and AI-assisted steps (Phases 3, 5, 6) cannot run for real until a
        working key is stored here.
      </p>

      <h2>Current status</h2>
      <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
            <th>Provider</th>
            <th>Status</th>
            <th>Rotated at</th>
          </tr>
        </thead>
        <tbody>
          {["youtube", "anthropic"].map((provider) => {
            const active = statuses.find((s) => s.provider === provider && s.status === "active");
            return (
              <tr key={provider} style={{ borderBottom: "1px solid #eee" }}>
                <td>{provider}</td>
                <td style={{ color: active ? "green" : "#999" }}>{active ? "Configured" : "Not configured"}</td>
                <td>{active?.rotatedAt ? new Date(active.rotatedAt).toLocaleString() : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>Add / rotate a key</h2>
      <AddCredentialForm />
    </main>
  );
}
