"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CreatorNote } from "@rdv/domain";
import { TextInput } from "../../../../components/ui/Form";
import { Button } from "../../../../components/ui/Button";
import { Alert } from "../../../../components/ui/Alert";
import { EmptyState } from "../../../../components/ui/EmptyState";

export function NotesPanel({ creatorId, initialNotes }: { creatorId: string; initialNotes: CreatorNote[] }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/creators/${creatorId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const resBody = await res.json().catch(() => ({}));
      setError(resBody.error ?? "Failed to add note.");
      return;
    }
    setBody("");
    router.refresh();
  }

  return (
    <div>
      {initialNotes.length === 0 ? (
        <div className="mb-3">
          <EmptyState title="No notes yet" />
        </div>
      ) : (
        <ul className="mb-3 flex flex-col divide-y divide-border">
          {initialNotes.map((n) => (
            <li key={n.id} className="py-2 first:pt-0">
              <div className="text-meta text-ink-faint">{n.createdAt.toLocaleString()}</div>
              <div className="whitespace-pre-wrap text-supporting text-ink">{n.body}</div>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleAdd} className="flex gap-2">
        <TextInput value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a note…" className="flex-1" />
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? "Adding…" : "Add"}
        </Button>
      </form>
      {error && (
        <div className="mt-2">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
    </div>
  );
}
