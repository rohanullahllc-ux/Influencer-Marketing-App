"use client";

import { useEffect, useRef, useState } from "react";
import type { Creator } from "@rdv/domain";
import { Button } from "../../../../components/ui/Button";
import { Alert } from "../../../../components/ui/Alert";
import { FormField, TextInput } from "../../../../components/ui/Form";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { Table, Thead, Th, Tr, Td } from "../../../../components/ui/Table";

const POLL_INTERVAL_MS = 2000;

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

  const isRunning = runId && state && state !== "completed" && state !== "failed";

  return (
    <div>
      <form onSubmit={handleSubmit} className="mb-4 flex flex-wrap items-end gap-3">
        <FormField label="Search query" htmlFor="discovery-query">
          <TextInput
            id="discovery-query"
            type="text"
            required
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. home cooking recipes"
            className="w-72"
          />
        </FormField>
        <FormField label="Max results" htmlFor="discovery-max">
          <TextInput
            id="discovery-max"
            type="number"
            min={1}
            max={25}
            value={maxResults}
            onChange={(e) => setMaxResults(Number(e.target.value))}
            className="w-24"
          />
        </FormField>
        <Button type="submit" variant="primary" disabled={submitting} className="mb-4">
          {submitting ? "Starting…" : "Run discovery"}
        </Button>
      </form>

      {error && (
        <div className="mb-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      {isRunning && (
        <div className="mb-3">
          <Alert tone="primary">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary-500" />
              Run {runId}: {state}… (polling every 2s)
            </span>
          </Alert>
        </div>
      )}

      {failedReason && (
        <div className="mb-3">
          <Alert tone="danger" title={`Discovery run ${runId} failed`}>
            {failedReason}
          </Alert>
        </div>
      )}

      {results && (
        <>
          <p className="mb-2 text-supporting text-ink-subtle">
            Run {runId} completed — {results.length} creator{results.length === 1 ? "" : "s"} found.
          </p>
          {results.length > 0 ? (
            <Table>
              <Thead>
                <Th>Channel</Th>
                <Th>Subscribers</Th>
                <Th>Country</Th>
                <Th>Provenance</Th>
              </Thead>
              <tbody>
                {results.map((c) => (
                  <Tr key={c.id}>
                    <Td>
                      {c.channelUrl ? (
                        <a href={c.channelUrl} className="text-primary-600 no-underline hover:underline">
                          {c.displayName ?? c.channelUrl}
                        </a>
                      ) : (
                        c.displayName ?? "—"
                      )}
                    </Td>
                    <Td>{c.subscriberCount ?? "—"}</Td>
                    <Td>{c.country ?? "—"}</Td>
                    <Td>
                      <StatusBadge label={c.provenance} tone="neutral" />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          ) : null}
        </>
      )}
    </div>
  );
}
