"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CreatorTask } from "@rdv/domain";
import { TextInput } from "../../../../components/ui/Form";
import { Button } from "../../../../components/ui/Button";
import { Alert } from "../../../../components/ui/Alert";
import { EmptyState } from "../../../../components/ui/EmptyState";

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
        <div className="mb-3">
          <EmptyState title="No tasks yet" />
        </div>
      ) : (
        <ul className="mb-3 flex flex-col divide-y divide-border">
          {initialTasks.map((t) => (
            <li key={t.id} className="flex items-center justify-between py-2 first:pt-0">
              <span className={`text-supporting ${t.status === "done" ? "text-ink-faint line-through" : "text-ink"}`}>{t.title}</span>
              {t.status === "open" && (
                <Button size="sm" variant="secondary" onClick={() => markDone(t.id)} disabled={updatingId === t.id}>
                  {updatingId === t.id ? "…" : "Mark done"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleAdd} className="flex gap-2">
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task…" className="flex-1" />
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
