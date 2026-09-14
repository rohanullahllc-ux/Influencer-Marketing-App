"use client";

import { useEffect, useRef, useState } from "react";
import type { Creator } from "@rdv/domain";

const POLL_INTERVAL_MS = 2000;

/**
 * Wave 2 Phase 3 (plan §8): triggers a narrow YouTube discovery search
 * (POST /api/products/:id/discovery), then polls the run's status
 * (GET .../discovery/:runId) until it completes or fails — the BullMQ
 * job itself is the run record, no separate tracking table. Only
 * rendered when the product has an approved Product Intelligence version
 * (checked by the caller): discovery is otherwise rejected server-side.
 */
export function DiscoveryPanel({ productId }: { productId: string }) {
  const [query, setQuery] = useState("");
  const [maxResults, setMaxResults] = useState(10);
  const [runId, setRunId] = useState<string | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [results, setResults] = useState<Creator[] | null>(null);
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
    const res = await fetch(`/api/products/${productId}/discovery/${id}`);
    if (!res.ok) {
      stopPolling();
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to check discovery run status.");
      return;
    }
    const status = await res.json();
    setState(status.state);
    if (status.state === "completed") {
      setResults(status.creators ?? []);
      stopPolling();
    } else if (status.state === "failed") {
      setFailedReason(status.failedReason ?? "Unknown error");
      stopPolling();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResults(null);
    setFailedReason(null);

    const res = await fetch(`/api/products/${productId}/discovery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, maxResults }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to start discovery.");
      return;
    }

    const { jobId } = await res.json();
    setRunId(jobId);
    setState("waiting");
    stopPolling();
    pollTimer.current = setInterval(() => void pollOnce(jobId), POLL_INTERVAL_MS);
    void pollOnce(jobId);
  }

  return (
    <div>
      <form onSubmit={handleSubmit} style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label htmlFor="discovery-query" style={{ display: "block", fontSize: 13, marginBottom: 2 }}>
              Search query
            </label>
            <input
              id="discovery-query"
              type="text"
              required
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. home cooking recipes"
              style={{ padding: 8, width: 280 }}
            />
          </div>
          <div>
            <label htmlFor="discovery-max" style={{ display: "block", fontSize: 13, marginBottom: 2 }}>
              Max results
            </label>
            <input
              id="discovery-max"
              type="number"
              min={1}
              max={25}
              value={maxResults}
              onChange={(e) => setMaxResults(Number(e.target.value))}
              style={{ padding: 8, width: 90 }}
            />
          </div>
          <button type="submit" disabled={submitting} style={{ padding: "8px 16px" }}>
            {submitting ? "Starting…" : "Run discovery"}
          </button>
        </div>
      </form>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {runId && state && state !== "completed" && state !== "failed" && (
        <p style={{ color: "#666", fontSize: 13 }}>Run {runId}: {state}… (polling every 2s)</p>
      )}

      {failedReason && (
        <p style={{ color: "crimson", fontSize: 13 }}>
          Discovery run {runId} failed: {failedReason}
        </p>
      )}

      {results && (
        <>
          <p style={{ fontSize: 13, color: "#666" }}>
            Run {runId} completed — {results.length} creator{results.length === 1 ? "" : "s"} found.
          </p>
          {results.length > 0 && (
            <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
                  <th>Channel</th>
                  <th>Subscribers</th>
                  <th>Country</th>
                  <th>Provenance</th>
                </tr>
              </thead>
              <tbody>
                {results.map((c) => (
                  <tr key={c.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td>{c.channelUrl ? <a href={c.channelUrl}>{c.displayName ?? c.channelUrl}</a> : (c.displayName ?? "—")}</td>
                    <td>{c.subscriberCount ?? "—"}</td>
                    <td>{c.country ?? "—"}</td>
                    <td>{c.provenance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
