import { getSystemHealth } from "../../lib/health";

export const dynamic = "force-dynamic";

/**
 * Minimal Wave 1 Operations surface (Step 5/Step 6: "separate from the
 * Human Task Inbox — shows queue backlog by lane, provider/DB/Redis
 * health"). This is intentionally thin in Wave 1: there are no failed
 * jobs, webhook failures, or credential problems to show yet because no
 * feature that could produce them has been built. It grows real content
 * (retry/cancel/inspect actions, per-provider failure counts) starting in
 * Wave 6 per the locked build plan — Wave 1's job is only to prove the
 * surface itself exists and reads real infrastructure state, not to be
 * feature-complete.
 */
export default async function OpsPage() {
  const health = await getSystemHealth();

  return (
    <main style={{ padding: 32, maxWidth: 720 }}>
      <h1>Operations</h1>
      <p>
        Overall status:{" "}
        <strong style={{ color: health.status === "ok" ? "green" : "crimson" }}>
          {health.status.toUpperCase()}
        </strong>
      </p>

      <h2>Dependency checks</h2>
      <table cellPadding={6} style={{ borderCollapse: "collapse" }}>
        <tbody>
          {Object.entries(health.checks).map(([name, check]) => (
            <tr key={name} style={{ borderBottom: "1px solid #ddd" }}>
              <td>{name}</td>
              <td style={{ color: check.ok ? "green" : "crimson" }}>{check.ok ? "OK" : "FAIL"}</td>
              <td>{check.error ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Queue lane depth (waiting + active + failed)</h2>
      <table cellPadding={6} style={{ borderCollapse: "collapse" }}>
        <tbody>
          {Object.entries(health.queueDepth).map(([lane, depth]) => (
            <tr key={lane} style={{ borderBottom: "1px solid #ddd" }}>
              <td>{lane}</td>
              <td>{depth === -1 ? "unavailable" : depth}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ color: "#666", fontSize: 14 }}>Checked at {health.timestamp}</p>
    </main>
  );
}
