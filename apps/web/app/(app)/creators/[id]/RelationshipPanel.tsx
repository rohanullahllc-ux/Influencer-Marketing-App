"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CreatorRelationship } from "@rdv/domain";
import { FormField, TextInput } from "../../../../components/ui/Form";
import { Button } from "../../../../components/ui/Button";
import { Alert } from "../../../../components/ui/Alert";

const STATUSES = ["new", "contacted", "in_conversation", "negotiating", "partnered", "declined", "unresponsive", "do_not_contact"] as const;

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
    <form onSubmit={handleSave} className="flex flex-wrap items-end gap-3">
      <FormField label="Status" htmlFor="status">
        <select
          id="status"
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="rounded-control border border-border-strong bg-white px-3 py-2 text-body text-ink focus-visible:focus-ring"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </FormField>
      <div className="min-w-[220px] flex-1">
        <FormField label="Next action" htmlFor="nextAction">
          <TextInput
            id="nextAction"
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            placeholder="e.g. Follow up next Tuesday"
          />
        </FormField>
      </div>
      <Button type="submit" variant="primary" disabled={submitting} className="mb-4">
        {submitting ? "Saving…" : "Save"}
      </Button>
      {error && (
        <div className="w-full">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
    </form>
  );
}
