"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../../../components/ui/Button";

/** Wave 6 (Job Reliability hardening): retries a real failed job in place via POST /api/ops/jobs/:lane/:jobId/retry. */
export function RetryJobButton({ lane, jobId }: { lane: string; jobId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRetry() {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/ops/jobs/${lane}/${jobId}/retry`, { method: "POST" });
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to retry job.");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <Button variant="secondary" size="sm" onClick={handleRetry} disabled={submitting}>
        {submitting ? "Retrying…" : "Retry"}
      </Button>
      {error && <div className="mt-1 text-meta text-danger-600">{error}</div>}
    </div>
  );
}
