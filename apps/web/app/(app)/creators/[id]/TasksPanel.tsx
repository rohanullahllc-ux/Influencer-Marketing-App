"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CreatorTask } from "@rdv/domain";

/** Wave 4 (Creator CRM): human-managed follow-up tasks on a creator. */
export function TasksPanel({ creatorId, initialTasks }: { creatorId: string; initialTasks: CreatorTask[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/creators/${creatorId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to add task.");
      return;
    }
    setTitle("");
    router.refresh();
  }

  async function markDone(taskId: string) {
    setUpdatingId(taskId);
    await fetch(`/api/creators/${creatorId}/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    setUpdatingId(null);
    router.refresh();
  }

  return (
    <div>
      {initialTasks.length === 0 ? (
        <p style={{ color: "#666" }}>No tasks yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, marginBottom: 12 }}>
          {initialTasks.map((t) => (
            <li key={t.id} style={{ borderBottom: "1px solid #eee", padding: "6px 0", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ textDecoration: t.status === "done" ? "line-through" : "none", color: t.status === "done" ? "#999" : undefined }}>
                {t.title}
              </span>
              {t.status === "open" && (
                <button onClick={() => markDone(t.id)} disabled={updatingId === t.id} style={{ padding: "2px 10px", fontSize: 12 }}>
                  {updatingId === t.id ? "…" : "Mark done"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleAdd} style={{ display: "flex", gap: 8 }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task…" style={{ flex: 1, padding: 6 }} />
        <button type="submit" disabled={submitting} style={{ padding: "6px 14px" }}>
          {submitting ? "Adding…" : "Add"}
        </button>
      </form>
      {error && <p style={{ color: "crimson", fontSize: 13 }}>{error}</p>}
    </div>
  );
}
