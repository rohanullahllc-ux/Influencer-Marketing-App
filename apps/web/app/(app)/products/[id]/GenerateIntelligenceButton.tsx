"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../../../../components/ui/Button";
import { Alert } from "../../../../components/ui/Alert";

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
    <div>
      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={handleClick} disabled={submitting}>
          {submitting ? "Queuing…" : "Generate AI Intelligence"}
        </Button>
        {queued && (
          <span className="text-supporting text-ink-subtle">
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
      </div>
      {error && (
        <div className="mt-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
    </div>
  );
}
