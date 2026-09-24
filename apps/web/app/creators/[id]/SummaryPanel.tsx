"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CreatorConversationSummary } from "@rdv/domain";

const POLL_INTERVAL_MS = 2000;

/** Wave 4 (Creator CRM): AI conversation summaries — read-only, append-only, never fabricated (fails loudly if there's no real history to summarize). */
export function SummaryPanel({
  creatorId,
  initialSummaries,
  hasHistory,
}: {
  creatorId: string;
  initialSummaries: CreatorConversationSummary[];
  hasHistory: boolean;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [state, setState] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  async function pollOnce(runId: string) {
    const res = await fetch(`/api/creators/summaries/runs/${runId}`);
    if (!res.ok) {
      stopPolling();
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to check summary run status.");
      return;
    }
    const status = await res.json();
    setState(status.state);
    if (status.state === "completed" || status.state === "failed") {
      stopPolling();
      if (status.state === "failed") setError(`Summary failed: ${status.failedReason}`);
      router.refresh();
    }
  }

  async function handleGenerate() {
    setRunning(true);
    setError(null);
    const res = await fetch(`/api/creators/${creatorId}/summaries`, { method: "POST" });
    setRunning(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to start summary.");
      return;
    }
    const { jobId } = await res.json();
    setState("waiting");
    stopPolling();
    pollTimer.current = setInterval(() => void pollOnce(jobId), POLL_INTERVAL_MS);
    void pollOnce(jobId);
  }

  const latest = initialSummaries[0];

  return (
    <div>
      {latest ? (
        <div style={{ fontSize: 13, marginBottom: 12, border: "1px solid #eee", borderRadius: 6, padding: 12 }}>
          <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Generated {latest.generatedAt.toLocaleString()} (from {latest.basedOnMessageCount} messages)</div>
          <p style={{ margin: 0 }}>{latest.summary}</p>
          {latest.keyPoints && latest.keyPoints.length > 0 && (
            <ul style={{ marginTop: 8, marginBottom: 0 }}>
              {latest.keyPoints.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p style={{ color: "#666" }}>No summary generated yet.</p>
      )}

      {hasHistory ? (
        <button onClick={handleGenerate} disabled={running} style={{ padding: "6px 12px" }}>
          {running ? "Starting…" : latest ? "Regenerate summary" : "Generate summary"}
        </button>
      ) : (
        <p style={{ color: "#999", fontSize: 13 }}>No outreach/reply history yet — nothing to summarize.</p>
      )}
      {state && state !== "completed" && state !== "failed" && <span style={{ marginLeft: 12, fontSize: 13, color: "#666" }}>{state}…</span>}
      {error && <p style={{ color: "crimson", fontSize: 13, marginTop: 4 }}>{error}</p>}
    </div>
  );
}
