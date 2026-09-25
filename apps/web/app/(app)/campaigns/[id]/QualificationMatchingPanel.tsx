"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Creator, CreatorQualification, CreatorMatch } from "@rdv/domain";
import { Table, Thead, Th, Tr, Td } from "../../../../components/ui/Table";
import { Button } from "../../../../components/ui/Button";
import { Alert } from "../../../../components/ui/Alert";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { StatusBadge } from "../../../../components/ui/StatusBadge";

const POLL_INTERVAL_MS = 2000;

export function QualificationMatchingPanel({
  campaignId,
  shortlistedCreators,
  initialQualifications,
  initialMatches,
}: {
  campaignId: string;
  shortlistedCreators: Creator[];
  initialQualifications: CreatorQualification[];
  initialMatches: CreatorMatch[];
}) {
  const router = useRouter();
  const [qualifying, setQualifying] = useState(false);
  const [matching, setMatching] = useState(false);
  const [matchState, setMatchState] = useState<string | null>(null);
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

  async function handleQualify() {
    setQualifying(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/qualify`, { method: "POST" });
    setQualifying(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to run qualification.");
      return;
    }
    router.refresh();
  }

  async function pollMatch(runId: string) {
    const res = await fetch(`/api/campaigns/${campaignId}/match/${runId}`);
    if (!res.ok) {
      stopPolling();
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to check matching run status.");
      return;
    }
    const status = await res.json();
    setMatchState(status.state);
    if (status.state === "completed" || status.state === "failed") {
      stopPolling();
      if (status.state === "failed") setError(`Matching run failed: ${status.failedReason}`);
      router.refresh();
    }
  }

  async function handleMatch() {
    setMatching(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/match`, { method: "POST" });
    setMatching(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to start matching.");
      return;
    }
    const { jobId } = await res.json();
    setMatchState("waiting");
    stopPolling();
    pollTimer.current = setInterval(() => void pollMatch(jobId), POLL_INTERVAL_MS);
    void pollMatch(jobId);
  }

  const qualificationByCreator = new Map(initialQualifications.map((q) => [q.creatorId, q]));
  const matchByCreator = new Map(initialMatches.map((m) => [m.creatorId, m]));
  const isMatchRunning = matchState && matchState !== "completed" && matchState !== "failed";

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Button variant="primary" onClick={handleQualify} disabled={qualifying || shortlistedCreators.length === 0}>
          {qualifying ? "Qualifying…" : "Run Qualification"}
        </Button>
        <Button variant="primary" onClick={handleMatch} disabled={matching || shortlistedCreators.length === 0}>
          {matching ? "Starting…" : "Run AI Matching"}
        </Button>
        {isMatchRunning && (
          <span className="inline-flex items-center gap-1.5 text-supporting text-ink-subtle">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary-500" />
            Matching: {matchState}…
          </span>
        )}
      </div>
      {error && (
        <div className="mb-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      {shortlistedCreators.length === 0 ? (
        <EmptyState title="No creators shortlisted" description="Shortlist a creator in the Creators tab before running qualification/matching." />
      ) : (
        <Table>
          <Thead>
            <Th>Creator</Th>
            <Th>Qualification</Th>
            <Th>Match score</Th>
            <Th>Explanation</Th>
          </Thead>
          <tbody>
            {shortlistedCreators.map((c) => {
              const q = qualificationByCreator.get(c.id);
              const m = matchByCreator.get(c.id);
              return (
                <Tr key={c.id}>
                  <Td className="align-top">{c.displayName ?? c.id}</Td>
                  <Td className="align-top">
                    {q ? (
                      <div>
                        <StatusBadge label={q.passed ? "PASS" : "FAIL"} tone={q.passed ? "success" : "danger"} />
                        {!q.passed && (q.measuredValues as { reasons?: string[] } | null)?.reasons && (
                          <div className="mt-1 text-meta text-ink-faint">
                            {((q.measuredValues as { reasons?: string[] }).reasons ?? []).join("; ")}
                          </div>
                        )}
                      </div>
                    ) : (
                      <StatusBadge label="not evaluated" tone="neutral" />
                    )}
                  </Td>
                  <Td className="align-top font-medium">{m ? Number(m.score).toFixed(2) : <span className="text-ink-faint">—</span>}</Td>
                  <Td className="max-w-md whitespace-normal align-top text-supporting">
                    {m ? m.explanation : <span className="text-ink-faint">—</span>}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
