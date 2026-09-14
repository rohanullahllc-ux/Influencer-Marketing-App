"use client";

import { useEffect, useRef, useState } from "react";
import type { Creator } from "@rdv/domain";

const POLL_INTERVAL_MS = 2000;

interface RowState {
  runId?: string;
  state?: string;
  draftId?: string;
  failedReason?: string;
  submitted?: boolean;
  error?: string;
}

/**
 * Wave 2 Phase 6 (plan §11): generates a personalized outreach draft for
 * one shortlisted creator at a time (async, polled), then submits it into
 * the Approval Queue. Never sends anything and never approves — approval
 * happens only on /approvals, by an Admin, explicitly.
 */
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
    return <p style={{ color: "#666" }}>Shortlist a creator above before generating outreach drafts.</p>;
  }

  return (
    <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
      <thead>
        <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
          <th>Creator</th>
          <th>Draft</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {shortlistedCreators.map((c) => {
          const row = rows[c.id] ?? {};
          return (
            <tr key={c.id} style={{ borderBottom: "1px solid #eee" }}>
              <td>{c.displayName ?? c.id}</td>
              <td style={{ fontSize: 13 }}>
                {row.draftId && <span style={{ color: "green" }}>Draft ready{row.submitted ? " — submitted for approval" : ""}</span>}
                {row.failedReason && <span style={{ color: "crimson" }}>Failed: {row.failedReason}</span>}
                {row.state && !row.draftId && !row.failedReason && <span style={{ color: "#666" }}>{row.state}…</span>}
                {row.error && <div style={{ color: "crimson" }}>{row.error}</div>}
              </td>
              <td>
                <button onClick={() => handleGenerate(c.id)} style={{ padding: "6px 12px", marginRight: 8 }}>
                  Generate draft
                </button>
                {row.draftId && !row.submitted && (
                  <button onClick={() => handleSubmitForApproval(c.id, row.draftId!)} style={{ padding: "6px 12px" }}>
                    Submit for approval
                  </button>
                )}
                {row.submitted && (
                  <a href="/approvals" style={{ fontSize: 13 }}>
                    View in Approval Queue
                  </a>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
