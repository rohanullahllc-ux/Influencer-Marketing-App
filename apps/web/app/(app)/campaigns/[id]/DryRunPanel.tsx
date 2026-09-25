"use client";

import { useEffect, useRef, useState } from "react";
import type { Creator } from "@rdv/domain";
import { Table, Thead, Th, Tr, Td } from "../../../../components/ui/Table";
import { Button } from "../../../../components/ui/Button";
import { Alert } from "../../../../components/ui/Alert";
import { StatusBadge } from "../../../../components/ui/StatusBadge";

const POLL_INTERVAL_MS = 2000;

interface DryRunResultRow {
  id: string;
  creatorId: string;
  eligible: boolean;
  blockReasons: string[] | null;
}

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
  const isRunning = state && state !== "completed" && state !== "failed";

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <Button variant="primary" onClick={handleRun} disabled={submitting || shortlistedCreators.length === 0}>
          {submitting ? "Starting…" : "Run Dry Run"}
        </Button>
        {isRunning && (
          <span className="inline-flex items-center gap-1.5 text-supporting text-ink-subtle">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary-500" />
            Run {runId}: {state}…
          </span>
        )}
      </div>
      {error && (
        <div className="mb-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      {failedReason && (
        <div className="mb-3">
          <Alert tone="danger" title="Dry run failed">
            {failedReason}
          </Alert>
        </div>
      )}

      {results && (
        <Table>
          <Thead>
            <Th>Creator</Th>
            <Th>Eligibility</Th>
            <Th>Reasons</Th>
          </Thead>
          <tbody>
            {results.map((r) => (
              <Tr key={r.id}>
                <Td>{byId.get(r.creatorId)?.displayName ?? r.creatorId}</Td>
                <Td>
                  <StatusBadge label={r.eligible ? "ELIGIBLE" : "BLOCKED"} tone={r.eligible ? "success" : "danger"} />
                </Td>
                <Td className="max-w-md whitespace-normal text-supporting text-ink-subtle">{(r.blockReasons ?? []).join(", ") || "—"}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
