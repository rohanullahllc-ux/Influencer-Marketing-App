"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormField, TextInput } from "../../../components/ui/Form";
import { Button } from "../../../components/ui/Button";
import { Alert } from "../../../components/ui/Alert";

/** Wave 2 Phase 7 (plan §12): adds a contact identity to the durable, workspace-scoped suppression/DNC list. */
export function AddSuppressionForm() {
  const router = useRouter();
  const [identity, setIdentity] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/suppressions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity, reason: reason || undefined }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to add suppression.");
      return;
    }

    setIdentity("");
    setReason("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md">
      <FormField label="Contact identity (e.g. email)" htmlFor="identity" required>
        <TextInput id="identity" type="text" required value={identity} onChange={(e) => setIdentity(e.target.value)} />
      </FormField>
      <FormField label="Reason" htmlFor="reason">
        <TextInput id="reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} />
      </FormField>
      {error && (
        <div className="mb-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <Button type="submit" variant="primary" disabled={submitting}>
        {submitting ? "Adding…" : "Add to suppression list"}
      </Button>
    </form>
  );
}
