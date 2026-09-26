"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormField, TextInput } from "../../../../components/ui/Form";
import { Button } from "../../../../components/ui/Button";
import { Alert } from "../../../../components/ui/Alert";

const selectClasses =
  "w-full rounded-control border border-border-strong bg-white px-3 py-2 text-body text-ink focus-visible:focus-ring";

export function AddCredentialForm() {
  const router = useRouter();
  const [provider, setProvider] = useState("youtube");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, apiKey }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to store key.");
      return;
    }

    setApiKey("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md">
      <FormField label="Provider" htmlFor="provider">
        <select id="provider" value={provider} onChange={(e) => setProvider(e.target.value)} className={selectClasses}>
          <option value="youtube">YouTube Data API</option>
          <option value="deepseek">DeepSeek API</option>
        </select>
      </FormField>
      <FormField label="API key" htmlFor="apiKey" required>
        <TextInput id="apiKey" type="password" required value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
      </FormField>
      {error && (
        <div className="mb-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <Button type="submit" variant="primary" disabled={submitting}>
        {submitting ? "Saving…" : "Save key"}
      </Button>
    </form>
  );
}
