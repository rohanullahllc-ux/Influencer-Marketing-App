"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Wave 2 Phase 2 (plan §7): triggers async AI generation of a new draft (POST /api/products/:id/intelligence). Generation runs on the ai-ops queue lane — this only enqueues it, it does not wait for completion. */
export function GenerateIntelligenceButton({ productId }: { productId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleClick() {
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/products/${productId}/intelligence`, { method: "POST" });
    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to queue generation.");
      return;
    }

    setQueued(true);
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <button onClick={handleClick} disabled={submitting} style={{ padding: "8px 16px" }}>
        {submitting ? "Queuing…" : "Generate AI Intelligence"}
      </button>
      {queued && (
        <span style={{ marginLeft: 12, fontSize: 13, color: "#666" }}>
          Queued — this runs in the background.{" "}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              router.refresh();
            }}
          >
            Refresh
          </a>{" "}
          in a few seconds to see the draft.
        </span>
      )}
      {error && <p style={{ color: "crimson", fontSize: 13 }}>{error}</p>}
    </div>
  );
}
