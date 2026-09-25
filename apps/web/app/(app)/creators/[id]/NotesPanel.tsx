"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CreatorNote } from "@rdv/domain";

/** Wave 4 (Creator CRM): append-only human notes on a creator. */
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
        <p style={{ color: "#666" }}>No notes yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, marginBottom: 12 }}>
          {initialNotes.map((n) => (
            <li key={n.id} style={{ borderBottom: "1px solid #eee", padding: "8px 0", fontSize: 13 }}>
              <div style={{ color: "#666", fontSize: 12 }}>{n.createdAt.toLocaleString()}</div>
              <div style={{ whiteSpace: "pre-wrap" }}>{n.body}</div>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleAdd} style={{ display: "flex", gap: 8 }}>
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a note…" style={{ flex: 1, padding: 6 }} />
        <button type="submit" disabled={submitting} style={{ padding: "6px 14px" }}>
          {submitting ? "Adding…" : "Add"}
        </button>
      </form>
      {error && <p style={{ color: "crimson", fontSize: 13 }}>{error}</p>}
    </div>
  );
}
