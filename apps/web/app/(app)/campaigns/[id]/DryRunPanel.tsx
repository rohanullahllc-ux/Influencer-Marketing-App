"use client";

import { useEffect, useRef, useState } from "react";
import type { Creator } from "@rdv/domain";

const POLL_INTERVAL_MS = 2000;

interface DryRunResultRow {
  id: string;
  creatorId: string;
  eligible: boolean;
  blockReasons: string[] | null;
}

/**
 * Wave 2 Phase 7 (plan §12): triggers a dry-run evaluation and shows the
 * eligible/blocked table with exact per-row reasons. Zero outbound
 * network calls happen anywhere in this flow — no provider adapter
 * exists in this codebase to call.
 */
export function DryRunPanel({ campaignId, shortlistedCreators }: { campaignId: string; shortlistedCreators: Creator[] }) {
  const [runId, setRunId] = useState<string | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [results, setResults] = useState<DryRunResultRow[] | null>(null);
  const [failedReason, setFailedReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  function stopPolling() {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }

  async function pollOnce(id: string) {
    const res = await fetch(`/api/campaigns/${campaignId}/dry-run/${id}`);
    if (!res.ok) {
      stopPolling();
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to check dry-run status.");
      return;
    }
    const status = await res.json();
    setState(status.state);
    if (status.state === "completed") {
      setResults(status.results ?? []);
      stopPolling();
    } else if (status.state === "failed") {
      setFailedReason(status.failedReason ?? "Unknown error");
      stopPolling();
    }
  }

  async function handleRun() {
    setSubmitting(true);
    setError(null);
    setResults(null);
    setFailedReason(null);

    const res = await fetch(`/api/campaigns/${campaignId}/dry-run`, { method: "POST" });
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to start dry run.");
      return;
    }
    const { jobId } = await res.json();
    setRunId(jobId);
    setState("waiting");
    stopPolling();
    pollTimer.current = setInterval(() => void pollOnce(jobId), POLL_INTERVAL_MS);
    void pollOnce(jobId);
  }

  const byId = new Map(shortlistedCreators.map((c) => [c.id, c]));

  return (
    <div>
      <button onClick={handleRun} disabled={submitting || shortlistedCreators.length === 0} style={{ padding: "8px 16px", marginBottom: 12 }}>
        {submitting ? "Starting…" : "Run Dry Run"}
      </button>
      {state && state !== "completed" && state !== "failed" && (
        <span style={{ marginLeft: 12, fontSize: 13, color: "#666" }}>Run {runId}: {state}…</span>
      )}
      {error && <p style={{ color: "crimson", fontSize: 13 }}>{error}</p>}
      {failedReason && <p style={{ color: "crimson", fontSize: 13 }}>Dry run failed: {failedReason}</p>}

      {results && (
        <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
              <th>Creator</th>
              <th>Eligible</th>
              <th>Reasons</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}>
                <td>{byId.get(r.creatorId)?.displayName ?? r.creatorId}</td>
                <td style={{ color: r.eligible ? "green" : "crimson", fontWeight: 600 }}>{r.eligible ? "ELIGIBLE" : "BLOCKED"}</td>
                <td style={{ fontSize: 12, color: "#666" }}>{(r.blockReasons ?? []).join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
