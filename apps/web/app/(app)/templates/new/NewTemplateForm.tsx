"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormField, TextInput, TextArea } from "../../../../components/ui/Form";
import { Button } from "../../../../components/ui/Button";
import { Alert } from "../../../../components/ui/Alert";

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
    <form onSubmit={handleSubmit} className="max-w-xl">
      <FormField label="Name" htmlFor="name" required>
        <TextInput id="name" type="text" required value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <FormField label="Subject" htmlFor="subject">
        <TextInput id="subject" type="text" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </FormField>
      <FormField label="Body" htmlFor="body">
        <TextArea id="body" value={body} onChange={(e) => setBody(e.target.value)} rows={6} />
      </FormField>
      <FormField label="Variables" htmlFor="variables" hint="Comma-separated, e.g. creator_name, product_name">
        <TextInput id="variables" type="text" value={variables} onChange={(e) => setVariables(e.target.value)} />
      </FormField>
      {error && (
        <div className="mb-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <Button type="submit" variant="primary" disabled={submitting}>
        {submitting ? "Creating…" : "Create template"}
      </Button>
    </form>
  );
}
