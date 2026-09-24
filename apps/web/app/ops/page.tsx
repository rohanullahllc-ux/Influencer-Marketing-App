import { getSystemHealth } from "../../lib/health";
import { getOpsQueueDetail } from "../../lib/opsQueueDetail";
import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../lib/session";
import { RetryJobButton } from "./RetryJobButton";

/**
 * Operations surface. Wave 1 proved the surface exists and reads real
 * infrastructure state (DB/Redis health, combined queue depth). Wave 6
 * (Job Reliability hardening) fills in the content that comment always
 * said would arrive here: per-lane state breakdown, real failed jobs with
 * their actual failure reason (never fabricated), a "possibly stuck"
 * active-job flag, and a real retry action — reading exactly the data
 * `removeOnFail: false` (packages/queue/src/queues.ts) was configured to
 * keep available for this page.
 *
 * Now gated behind an authenticated Owner/Admin session (Wave 6 finding:
 * this page previously had no auth check at all, and was about to start
 * showing real job payloads — workspace/creator/email data — which must
 * never be exposed without authentication). `/api/health` remains
 * deliberately unauthenticated for deployment/orchestration tooling; this
 * human-facing dashboard is a different, more sensitive surface.
 */
export default async function OpsPage() {
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
        <p>Only an Owner or Admin may view Operations.</p>
      </main>
    );
  }

  const health = await getSystemHealth();
  const detail = await getOpsQueueDetail();

  return (
    <main style={{ padding: 32, maxWidth: 880 }}>
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

      <h2 style={{ marginTop: 24 }}>Queue lanes — real per-state counts</h2>
      <table cellPadding={6} style={{ borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
            <th>Lane</th>
            <th>Waiting</th>
            <th>Active</th>
            <th>Delayed</th>
            <th>Failed</th>
            <th>Completed (last 7d)</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(detail.countsByLane).map(([lane, counts]) => (
            <tr key={lane} style={{ borderBottom: "1px solid #eee" }}>
              <td>{lane}</td>
              <td>{counts.waiting}</td>
              <td>{counts.active}</td>
              <td>{counts.delayed}</td>
              <td style={{ color: counts.failed > 0 ? "crimson" : undefined }}>{counts.failed}</td>
              <td>{counts.completed}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ marginTop: 24 }}>Possibly stuck jobs</h2>
      <p style={{ fontSize: 13, color: "#666" }}>
        An active job processing longer than 2 minutes against local Mock providers — worth a human look, nothing
        here cancels or kills a job automatically.
      </p>
      {detail.stuckJobs.length === 0 ? (
        <p style={{ color: "#666" }}>None.</p>
      ) : (
        <table cellPadding={6} style={{ borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
              <th>Lane</th>
              <th>Job</th>
              <th>Processing for</th>
            </tr>
          </thead>
          <tbody>
            {detail.stuckJobs.map((j) => (
              <tr key={`${j.lane}-${j.id}`} style={{ borderBottom: "1px solid #eee" }}>
                <td>{j.lane}</td>
                <td>
                  {j.name} ({j.id})
                </td>
                <td>{Math.round(j.processingForMs / 1000)}s</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 style={{ marginTop: 24 }}>Failed jobs</h2>
      <p style={{ fontSize: 13, color: "#666" }}>
        Real failures, retained on purpose (never auto-removed) so every one is reconcilable — never treated as
        proof the underlying action failed on the provider side too (see each domain module's own interruption-
        safety design for outreach sends / affiliate creation).
      </p>
      {detail.failedJobs.length === 0 ? (
        <p style={{ color: "#666" }}>None.</p>
      ) : (
        <table cellPadding={6} style={{ borderCollapse: "collapse", fontSize: 13, width: "100%" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
              <th>Lane</th>
              <th>Job</th>
              <th>Attempts</th>
              <th>Reason</th>
              <th>When</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {detail.failedJobs.map((j) => (
              <tr key={`${j.lane}-${j.id}`} style={{ borderBottom: "1px solid #eee" }}>
                <td>{j.lane}</td>
                <td>
                  {j.name} ({j.id})
                </td>
                <td>{j.attemptsMade}</td>
                <td style={{ maxWidth: 320, overflowWrap: "break-word" }}>{j.failedReason}</td>
                <td>{new Date(j.timestamp).toLocaleString()}</td>
                <td>
                  <RetryJobButton lane={j.lane} jobId={j.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p style={{ color: "#666", fontSize: 14, marginTop: 24 }}>Checked at {health.timestamp}</p>
    </main>
  );
}
