"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OutreachTemplate } from "@rdv/domain";
import { FormField, TextInput, TextArea } from "../../../../components/ui/Form";
import { Button } from "../../../../components/ui/Button";
import { Alert } from "../../../../components/ui/Alert";

const selectClasses =
  "w-full rounded-control border border-border-strong bg-white px-3 py-2 text-body text-ink focus-visible:focus-ring sm:w-48";

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
    <form onSubmit={handleSubmit} className="max-w-xl">
      <FormField label="Name" htmlFor="name">
        <TextInput id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <FormField label="Subject" htmlFor="subject">
        <TextInput id="subject" type="text" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </FormField>
      <FormField label="Body" htmlFor="body">
        <TextArea id="body" value={body} onChange={(e) => setBody(e.target.value)} rows={6} />
      </FormField>
      <FormField label="Status" htmlFor="status">
        <select
          id="status"
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className={selectClasses}
        >
          <option value="draft">draft</option>
          <option value="active">active</option>
          <option value="archived">archived</option>
        </select>
      </FormField>
      {error && (
        <div className="mb-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <Button type="submit" variant="primary" disabled={submitting}>
        {submitting ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
