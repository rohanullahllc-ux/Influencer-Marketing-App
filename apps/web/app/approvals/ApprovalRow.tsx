"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Approval } from "@rdv/domain";

const STATUS_COLOR: Record<string, string> = {
  pending: "#b8860b",
  approved: "green",
  rejected: "crimson",
  returned_for_edit: "#b8860b",
  invalidated: "#999",
};

/**
 * Wave 2 Phase 6 (plan §11): one row in the central Approval Queue —
 * exact recipient/campaign/content, with Approve/Reject/Request-edit
 * actions (Admin-only server-side), plus an inline "edit the underlying
 * draft" affordance that demonstrates the invalidation rule directly: an
 * edit here, if this approval is still pending/approved, invalidates it.
 */
export function ApprovalRow({ approval, canDecide }: { approval: Approval; canDecide: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(approval.exactSubject);
  const [body, setBody] = useState(approval.exactBody);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);

  async function decide(decision: "approve" | "reject" | "request-edit") {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/approvals/${approval.id}/${decision}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: notes || undefined }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const resBody = await res.json().catch(() => ({}));
      setError(resBody.error ?? "Failed to record decision.");
      return;
    }
    router.refresh();
  }

  async function handleEditDraft(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/outreach-drafts/${approval.outreachDraftId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const resBody = await res.json().catch(() => ({}));
      setError(resBody.error ?? "Failed to edit draft.");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  async function handleScheduleSend() {
    setScheduling(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${approval.campaignId}/sends`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvalId: approval.id }),
    });
    setScheduling(false);
    if (!res.ok) {
      const resBody = await res.json().catch(() => ({}));
      setError(resBody.error ?? "Failed to schedule send.");
      return;
    }
    const send = await res.json();
    setSendStatus(send.status);
  }

  const isPending = approval.status === "pending";
  const isApproved = approval.status === "approved";

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 600, color: STATUS_COLOR[approval.status] ?? "#333" }}>{approval.status.toUpperCase()}</span>
        <span style={{ fontSize: 12, color: "#666" }}>{new Date(approval.createdAt).toLocaleString()}</span>
      </div>
      <p style={{ fontSize: 12, color: "#666", margin: "4px 0" }}>
        Campaign {approval.campaignId} · Creator {approval.creatorId} · content hash {approval.contentHash.slice(0, 12)}…
      </p>

      {editing ? (
        <form onSubmit={handleEditDraft}>
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: "block", fontSize: 13 }}>Subject</label>
            <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} style={{ width: "100%", padding: 6 }} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: "block", fontSize: 13 }}>Body</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} style={{ width: "100%", padding: 6 }} />
          </div>
          <button type="submit" disabled={submitting} style={{ padding: "6px 12px", marginRight: 8 }}>
            Save edit (invalidates this approval if it's pending/approved)
          </button>
          <button type="button" onClick={() => setEditing(false)} style={{ padding: "6px 12px" }}>
            Cancel
          </button>
        </form>
      ) : (
        <>
          <p style={{ fontWeight: 600, margin: "8px 0 2px" }}>{approval.exactSubject}</p>
          <p style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{approval.exactBody}</p>
        </>
      )}

      {error && <p style={{ color: "crimson", fontSize: 13 }}>{error}</p>}

      {!editing && (
        <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
          {isPending && canDecide && (
            <>
              <button onClick={() => decide("approve")} disabled={submitting} style={{ padding: "6px 12px" }}>
                Approve
              </button>
              <button onClick={() => decide("reject")} disabled={submitting} style={{ padding: "6px 12px" }}>
                Reject
              </button>
              <button onClick={() => decide("request-edit")} disabled={submitting} style={{ padding: "6px 12px" }}>
                Request edit
              </button>
            </>
          )}
          <button onClick={() => setEditing(true)} disabled={submitting} style={{ padding: "6px 12px" }}>
            Edit underlying draft
          </button>
          {isApproved && !sendStatus && (
            <button onClick={handleScheduleSend} disabled={scheduling} style={{ padding: "6px 12px" }}>
              {scheduling ? "Scheduling…" : "Schedule send"}
            </button>
          )}
          {sendStatus && (
            <span style={{ fontSize: 13, color: "#666" }}>
              Send {sendStatus} — see the campaign&apos;s Sends panel for live status.
            </span>
          )}
        </div>
      )}
      {approval.decidedAt && (
        <p style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
          Decided {new Date(approval.decidedAt).toLocaleString()}
          {approval.decisionNotes ? ` — ${approval.decisionNotes}` : ""}
        </p>
      )}
    </div>
  );
}
