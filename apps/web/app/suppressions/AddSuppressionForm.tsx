"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    <form onSubmit={handleSubmit} style={{ maxWidth: 420 }}>
      <div style={{ marginBottom: 10 }}>
        <label htmlFor="identity" style={{ display: "block", marginBottom: 4 }}>
          Contact identity (e.g. email)
        </label>
        <input id="identity" type="text" required value={identity} onChange={(e) => setIdentity(e.target.value)} style={{ width: "100%", padding: 8 }} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label htmlFor="reason" style={{ display: "block", marginBottom: 4 }}>
          Reason
        </label>
        <input id="reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: "100%", padding: 8 }} />
      </div>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <button type="submit" disabled={submitting} style={{ padding: "8px 16px" }}>
        {submitting ? "Adding…" : "Add to suppression list"}
      </button>
    </form>
  );
}
