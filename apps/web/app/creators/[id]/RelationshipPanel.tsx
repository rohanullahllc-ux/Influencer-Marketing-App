"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CreatorRelationship } from "@rdv/domain";

const STATUSES = ["new", "contacted", "in_conversation", "negotiating", "partnered", "declined", "unresponsive", "do_not_contact"] as const;

/** Wave 4 (Creator CRM): lifecycle/relationship status + next action, human-set only. */
export function RelationshipPanel({ creatorId, relationship }: { creatorId: string; relationship: CreatorRelationship }) {
  const router = useRouter();
  const [status, setStatus] = useState(relationship.status);
  const [nextAction, setNextAction] = useState(relationship.nextAction ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/creators/${creatorId}/relationship`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, nextAction: nextAction.trim() || null }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to update relationship.");
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={handleSave} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      <label>
        Status
        <br />
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} style={{ padding: 6 }}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </label>
      <label style={{ flex: 1, minWidth: 220 }}>
        Next action
        <br />
        <input
          value={nextAction}
          onChange={(e) => setNextAction(e.target.value)}
          placeholder="e.g. Follow up next Tuesday"
          style={{ padding: 6, width: "100%" }}
        />
      </label>
      <button type="submit" disabled={submitting} style={{ padding: "8px 14px" }}>
        {submitting ? "Saving…" : "Save"}
      </button>
      {error && <p style={{ color: "crimson", fontSize: 13, width: "100%" }}>{error}</p>}
    </form>
  );
}
