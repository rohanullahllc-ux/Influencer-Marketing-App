"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Wave 2 Phase 4 (plan §9): creates an outreach template (draft/active/archived), no A/B testing infra. */
export function NewTemplateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [variables, setVariables] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        subject: subject || undefined,
        body: body || undefined,
        variables: variables
          ? variables
              .split(",")
              .map((v) => v.trim())
              .filter(Boolean)
          : undefined,
      }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const resBody = await res.json().catch(() => ({}));
      setError(resBody.error ?? "Failed to create template.");
      return;
    }

    const template = await res.json();
    router.push(`/templates/${template.id}`);
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 560 }}>
      <div style={{ marginBottom: 10 }}>
        <label htmlFor="name" style={{ display: "block", marginBottom: 4 }}>
          Name
        </label>
        <input id="name" type="text" required value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%", padding: 8 }} />
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
        <label htmlFor="variables" style={{ display: "block", marginBottom: 4 }}>
          Variables (comma-separated, e.g. creator_name, product_name)
        </label>
        <input id="variables" type="text" value={variables} onChange={(e) => setVariables(e.target.value)} style={{ width: "100%", padding: 8 }} />
      </div>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <button type="submit" disabled={submitting} style={{ padding: "8px 16px" }}>
        {submitting ? "Creating…" : "Create template"}
      </button>
    </form>
  );
}
