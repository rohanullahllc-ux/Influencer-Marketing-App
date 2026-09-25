"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CreatorConversationSummary } from "@rdv/domain";
import { Button } from "../../../../components/ui/Button";
import { Alert } from "../../../../components/ui/Alert";

const POLL_INTERVAL_MS = 2000;

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
  const isRunning = state && state !== "completed" && state !== "failed";

  return (
    <div>
      {latest ? (
        <div className="mb-3 rounded-card border border-border bg-surface-subtle p-3">
          <div className="mb-1 text-meta text-ink-faint">
            Generated {latest.generatedAt.toLocaleString()} (from {latest.basedOnMessageCount} messages)
          </div>
          <p className="m-0 text-supporting text-ink">{latest.summary}</p>
          {latest.keyPoints && latest.keyPoints.length > 0 && (
            <ul className="mb-0 mt-2 list-disc pl-5 text-supporting text-ink">
              {latest.keyPoints.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="mb-3 text-supporting text-ink-subtle">No summary generated yet.</p>
      )}

      <div className="flex items-center gap-3">
        {hasHistory ? (
          <Button variant="secondary" onClick={handleGenerate} disabled={running}>
            {running ? "Starting…" : latest ? "Regenerate summary" : "Generate summary"}
          </Button>
        ) : (
          <p className="text-supporting text-ink-faint">No outreach/reply history yet — nothing to summarize.</p>
        )}
        {isRunning && (
          <span className="inline-flex items-center gap-1.5 text-supporting text-ink-subtle">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary-500" />
            {state}…
          </span>
        )}
      </div>
      {error && (
        <div className="mt-2">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
    </div>
  );
}
