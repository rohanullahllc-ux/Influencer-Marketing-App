"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormSection, FormField, TextInput, TextArea } from "../../../../components/ui/Form";
import { Button } from "../../../../components/ui/Button";
import { Alert } from "../../../../components/ui/Alert";

export function NewProductForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: description || undefined }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to create product.");
      return;
    }

    const product = await res.json();
    router.push(`/products/${product.id}`);
  }

  return (
    <form onSubmit={handleSubmit}>
      <FormSection title="Product details" description="What are you promoting? This feeds AI Product Intelligence and creator discovery.">
        <FormField label="Name" htmlFor="name" required>
          <TextInput id="name" type="text" required value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label="Description" htmlFor="description" hint="Optional, but helps the AI generate more accurate intelligence.">
          <TextArea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
        </FormField>
      </FormSection>

      {error && (
        <div className="mb-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      <Button type="submit" variant="primary" disabled={submitting}>
        {submitting ? "Creating…" : "Create product"}
      </Button>
    </form>
  );
}
