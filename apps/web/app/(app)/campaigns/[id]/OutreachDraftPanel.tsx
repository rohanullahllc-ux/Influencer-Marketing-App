"use client";

import { useEffect, useRef, useState } from "react";
import type { Creator } from "@rdv/domain";
import { Table, Thead, Th, Tr, Td } from "../../../../components/ui/Table";
import { Button } from "../../../../components/ui/Button";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { EmptyState } from "../../../../components/ui/EmptyState";

const POLL_INTERVAL_MS = 2000;

interface RowState {
  runId?: string;
  state?: string;
  draftId?: string;
  failedReason?: string;
  submitted?: boolean;
  error?: string;
}

export function OutreachDraftPanel({ campaignId, shortlistedCreators }: { campaignId: string; shortlistedCreators: Creator[] }) {
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const timers = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  useEffect(() => {
    return () => {
      Object.values(timers.current).forEach(clearInterval);
    };
  }, []);

  function updateRow(creatorId: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [creatorId]: { ...prev[creatorId], ...patch } }));
  }

  async function pollRun(creatorId: string, runId: string) {
    const res = await fetch(`/api/outreach-drafts/runs/${runId}`);
    if (!res.ok) {
      clearInterval(timers.current[creatorId]);
      const body = await res.json().catch(() => ({}));
      updateRow(creatorId, { error: body.error ?? "Failed to check run status." });
      return;
    }
    const status = await res.json();
    updateRow(creatorId, { state: status.state });
    if (status.state === "completed") {
      clearInterval(timers.current[creatorId]);
      updateRow(creatorId, { draftId: status.draftId });
    } else if (status.state === "failed") {
      clearInterval(timers.current[creatorId]);
      updateRow(creatorId, { failedReason: status.failedReason });
    }
  }

  async function handleGenerate(creatorId: string) {
    updateRow(creatorId, { error: undefined, failedReason: undefined, draftId: undefined, submitted: false });
    const res = await fetch("/api/outreach-drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId, creatorId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      updateRow(creatorId, { error: body.error ?? "Failed to start generation." });
      return;
    }
    const { jobId } = await res.json();
    updateRow(creatorId, { runId: jobId, state: "waiting" });
    if (timers.current[creatorId]) clearInterval(timers.current[creatorId]);
    timers.current[creatorId] = setInterval(() => void pollRun(creatorId, jobId), POLL_INTERVAL_MS);
    void pollRun(creatorId, jobId);
  }

  async function handleSubmitForApproval(creatorId: string, draftId: string) {
    const res = await fetch(`/api/outreach-drafts/${draftId}/approval`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      updateRow(creatorId, { error: body.error ?? "Failed to submit for approval." });
      return;
    }
    updateRow(creatorId, { submitted: true });
  }

  if (shortlistedCreators.length === 0) {
    return <EmptyState title="No creators shortlisted" description="Shortlist a creator in the Creators tab before generating outreach drafts." />;
  }

  return (
    <Table>
      <Thead>
        <Th>Creator</Th>
        <Th>Draft</Th>
        <Th>Actions</Th>
      </Thead>
      <tbody>
        {shortlistedCreators.map((c) => {
          const row = rows[c.id] ?? {};
          return (
            <Tr key={c.id}>
              <Td>{c.displayName ?? c.id}</Td>
              <Td>
                {row.draftId && (
                  <div className="flex items-center gap-2">
                    <StatusBadge label={row.submitted ? "submitted for approval" : "draft ready"} tone="success" />
                  </div>
                )}
                {row.failedReason && <StatusBadge label={`Failed: ${row.failedReason}`} tone="danger" />}
                {row.state && !row.draftId && !row.failedReason && (
                  <span className="inline-flex items-center gap-1.5 text-supporting text-ink-subtle">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-primary-500" />
                    {row.state}…
                  </span>
                )}
                {row.error && <div className="mt-1 text-supporting text-danger-600">{row.error}</div>}
              </Td>
              <Td>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => handleGenerate(c.id)}>
                    Generate draft
                  </Button>
                  {row.draftId && !row.submitted && (
                    <Button size="sm" variant="primary" onClick={() => handleSubmitForApproval(c.id, row.draftId!)}>
                      Submit for approval
                    </Button>
                  )}
                  {row.submitted && (
                    <a href="/approvals" className="text-supporting text-primary-600 no-underline hover:underline">
                      View in Approval Queue
                    </a>
                  )}
                </div>
              </Td>
            </Tr>
          );
        })}
      </tbody>
    </Table>
  );
}
