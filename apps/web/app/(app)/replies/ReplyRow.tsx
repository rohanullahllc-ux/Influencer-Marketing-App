"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { InboundMessage } from "@rdv/domain";
import { Card } from "../../../components/ui/Card";
import { StatusBadge, toneForStatus } from "../../../components/ui/StatusBadge";
import { Button } from "../../../components/ui/Button";
import { Alert } from "../../../components/ui/Alert";

const POLL_INTERVAL_MS = 2000;

export function ReplyRow({
  message,
  campaignName,
  creatorName,
}: {
  message: InboundMessage;
  campaignName?: string;
  creatorName?: string;
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

  const isRunning = state && state !== "completed" && state !== "failed";

  return (
    <Card
      title={
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-ink">{message.fromIdentity}</span>
          {(campaignName || creatorName) && (
            <span className="text-supporting text-ink-faint">
              {creatorName}
              {creatorName && campaignName && " · "}
              {campaignName}
            </span>
          )}
        </div>
      }
      actions={
        <div className="flex items-center gap-2">
          <StatusBadge label={`match: ${message.matchStatus}`} tone={toneForStatus(message.matchStatus)} />
          <span className="text-meta text-ink-faint">{new Date(message.receivedAt).toLocaleString()}</span>
        </div>
      }
    >
      <div className="rounded-card border border-border bg-surface-subtle p-3">
        {message.subject && <p className="mb-1 font-semibold text-ink">{message.subject}</p>}
        <p className="whitespace-pre-wrap text-body text-ink">{message.body}</p>
      </div>

      {message.classification ? (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={message.classification.replace(/_/g, " ")} tone={toneForStatus(message.classification)} />
            {message.classificationConfidence && (
              <span className="text-meta text-ink-faint">confidence {Number(message.classificationConfidence).toFixed(2)}</span>
            )}
          </div>
          {message.classificationLimitations && (
            <p className="mt-1.5 text-supporting text-ink-subtle">{message.classificationLimitations}</p>
          )}
          {message.extractedFacts && message.extractedFacts.length > 0 && (
            <p className="mt-1.5 text-supporting text-ink-subtle">Facts: {message.extractedFacts.join("; ")}</p>
          )}
          {message.suggestedDraftId ? (
            <p className="mt-2 text-supporting text-ink">
              Suggested response drafted — review and approve it on{" "}
              <a href="/approvals" className="text-primary-600 no-underline hover:underline">
                /approvals
              </a>
              .
            </p>
          ) : (
            <p className="mt-2 text-supporting text-ink-faint">
              No suggested response (not interested, or not matched to a specific campaign/creator).
            </p>
          )}
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-3">
          <Button variant="secondary" onClick={handleClassify} disabled={running}>
            {running ? "Starting…" : "Classify with AI"}
          </Button>
          {isRunning && (
            <span className="inline-flex items-center gap-1.5 text-supporting text-ink-subtle">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary-500" />
              {state}…
            </span>
          )}
        </div>
      )}
      {error && (
        <div className="mt-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
    </Card>
  );
}
