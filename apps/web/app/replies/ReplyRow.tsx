"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { InboundMessage } from "@rdv/domain";

const POLL_INTERVAL_MS = 2000;

const MATCH_COLOR: Record<string, string> = { matched: "green", ambiguous: "#b8860b", unknown: "#999" };
const CLASS_COLOR: Record<string, string> = { interested: "green", not_interested: "#999", needs_human_review: "#b8860b" };

/** Wave 3: one inbound reply — real content, real match status, and (once run) real AI classification with confidence/limitations. */
export function ReplyRow({ message }: { message: InboundMessage }) {
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
    const res = await fetch(`/api/replies/runs/${runId}`);
    if (!res.ok) {
      stopPolling();
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to check classification run status.");
      return;
    }
    const status = await res.json();
    setState(status.state);
    if (status.state === "completed" || status.state === "failed") {
      stopPolling();
      if (status.state === "failed") setError(`Classification failed: ${status.failedReason}`);
      router.refresh();
    }
  }

  async function handleClassify() {
    setRunning(true);
    setError(null);
    const res = await fetch(`/api/replies/${message.id}/classify`, { method: "POST" });
    setRunning(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to start classification.");
      return;
    }
    const { jobId } = await res.json();
    setState("waiting");
    stopPolling();
    pollTimer.current = setInterval(() => void pollOnce(jobId), POLL_INTERVAL_MS);
    void pollOnce(jobId);
  }

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontWeight: 600 }}>{message.fromIdentity}</span>
        <span style={{ fontSize: 12, color: MATCH_COLOR[message.matchStatus] ?? "#333" }}>match: {message.matchStatus}</span>
        <span style={{ fontSize: 12, color: "#666" }}>{new Date(message.receivedAt).toLocaleString()}</span>
      </div>
      {message.subject && <p style={{ fontWeight: 600, margin: "8px 0 2px" }}>{message.subject}</p>}
      <p style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{message.body}</p>

      {message.classification ? (
        <div style={{ marginTop: 8, fontSize: 13 }}>
          <span style={{ fontWeight: 600, color: CLASS_COLOR[message.classification] ?? "#333" }}>
            {message.classification.toUpperCase()}
          </span>
          {message.classificationConfidence && <span style={{ color: "#666" }}> · confidence {Number(message.classificationConfidence).toFixed(2)}</span>}
          {message.classificationLimitations && <p style={{ color: "#666", margin: "4px 0" }}>{message.classificationLimitations}</p>}
          {message.extractedFacts && message.extractedFacts.length > 0 && (
            <p style={{ color: "#666", margin: "4px 0" }}>Facts: {message.extractedFacts.join("; ")}</p>
          )}
          {message.suggestedDraftId ? (
            <p style={{ marginTop: 4 }}>
              Suggested response drafted — review and approve it on <a href="/approvals">/approvals</a>.
            </p>
          ) : (
            <p style={{ color: "#999", marginTop: 4 }}>No suggested response (not_interested, or not matched to a specific campaign/creator).</p>
          )}
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          <button onClick={handleClassify} disabled={running} style={{ padding: "6px 12px" }}>
            {running ? "Starting…" : "Classify with AI"}
          </button>
          {state && state !== "completed" && state !== "failed" && (
            <span style={{ marginLeft: 12, fontSize: 13, color: "#666" }}>{state}…</span>
          )}
        </div>
      )}
      {error && <p style={{ color: "crimson", fontSize: 13, marginTop: 4 }}>{error}</p>}
    </div>
  );
}
