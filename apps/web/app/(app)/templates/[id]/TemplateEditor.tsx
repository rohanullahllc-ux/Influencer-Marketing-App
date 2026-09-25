"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OutreachTemplate } from "@rdv/domain";

/** Wave 2 Phase 4 (plan §9): edits a template's content/status. Mutable — not a version-history system. */
export function TemplateEditor({ template }: { template: OutreachTemplate }) {
  const router = useRouter();
  const [name, setName] = useState(template.name);
  const [subject, setSubject] = useState(template.subject ?? "");
  const [body, setBody] = useState(template.body ?? "");
  const [status, setStatus] = useState(template.status);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/templates/${template.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, subject, body, status }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const resBody = await res.json().catch(() => ({}));
      setError(resBody.error ?? "Failed to save template.");
      return;
    }

    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 560 }}>
      <div style={{ marginBottom: 10 }}>
        <label htmlFor="name" style={{ display: "block", marginBottom: 4 }}>
          Name
        </label>
        <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%", padding: 8 }} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label htmlFor="subject" style={{ display: "block", marginBottom: 4 }}>
          Subject
        </label>
        <input id="subject" type="text" value={subject} onChange={(e) => setSubject(e.target.value)} style={{ width: "100%", padding: 8 }} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label htmlFor="body" style={{ display: "block", marginBottom: 4 }}>
          Body
        </label>
        <textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} rows={6} style={{ width: "100%", padding: 8 }} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label htmlFor="status" style={{ display: "block", marginBottom: 4 }}>
          Status
        </label>
        <select
          id="status"
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          style={{ padding: 8 }}
        >
          <option value="draft">draft</option>
          <option value="active">active</option>
          <option value="archived">archived</option>
        </select>
      </div>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <button type="submit" disabled={submitting} style={{ padding: "8px 16px" }}>
        {submitting ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
