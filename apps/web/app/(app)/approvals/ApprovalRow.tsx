"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Approval } from "@rdv/domain";
import { Card } from "../../../components/ui/Card";
import { StatusBadge, toneForStatus } from "../../../components/ui/StatusBadge";
import { Button } from "../../../components/ui/Button";
import { Alert } from "../../../components/ui/Alert";
import { TextInput, TextArea } from "../../../components/ui/Form";

export function ApprovalRow({
  approval,
  canDecide,
  campaignName,
  creatorName,
}: {
  approval: Approval;
  canDecide: boolean;
  campaignName: string;
  creatorName: string;
}) {
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
    <Card
      className={isPending ? "border-warning-200" : undefined}
      title={
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label={approval.status.replace(/_/g, " ")} tone={toneForStatus(approval.status)} />
          <span className="text-supporting font-medium text-ink">
            {campaignName} <span className="text-ink-faint">·</span> {creatorName}
          </span>
        </div>
      }
      actions={
        <span className="text-meta text-ink-faint" title={`content hash ${approval.contentHash}`}>
          {new Date(approval.createdAt).toLocaleString()}
        </span>
      }
    >
      {editing ? (
        <form onSubmit={handleEditDraft}>
          <div className="mb-3">
            <label className="mb-1 block text-supporting font-medium text-ink">Subject</label>
            <TextInput type="text" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="mb-3">
            <label className="mb-1 block text-supporting font-medium text-ink">Body</label>
            <TextArea value={body} onChange={(e) => setBody(e.target.value)} rows={5} />
          </div>
          <div className="mb-3">
            <Alert tone="warning">Saving invalidates this approval if it&apos;s still pending or approved — the content changed.</Alert>
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={submitting}>
              Save edit
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="rounded-card border border-border bg-surface-subtle p-3">
          <p className="mb-1 font-semibold text-ink">{approval.exactSubject}</p>
          <p className="whitespace-pre-wrap text-body text-ink">{approval.exactBody}</p>
        </div>
      )}

      {error && (
        <div className="mt-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      {!editing && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {isPending && canDecide && (
            <>
              <Button variant="primary" onClick={() => decide("approve")} disabled={submitting}>
                Approve
              </Button>
              <Button variant="secondary" onClick={() => decide("reject")} disabled={submitting}>
                Reject
              </Button>
              <Button variant="secondary" onClick={() => decide("request-edit")} disabled={submitting}>
                Request edit
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={() => setEditing(true)} disabled={submitting}>
            Edit underlying draft
          </Button>
          {isApproved && !sendStatus && (
            <Button variant="primary" onClick={handleScheduleSend} disabled={scheduling}>
              {scheduling ? "Scheduling…" : "Schedule send"}
            </Button>
          )}
          {sendStatus && (
            <span className="text-supporting text-ink-subtle">
              Send {sendStatus} — see the campaign&apos;s Sends tab for live status.
            </span>
          )}
        </div>
      )}
      {approval.decidedAt && (
        <p className="mt-3 text-meta text-ink-faint">
          Decided {new Date(approval.decidedAt).toLocaleString()}
          {approval.decisionNotes ? ` — ${approval.decisionNotes}` : ""}
        </p>
      )}
    </Card>
  );
}
