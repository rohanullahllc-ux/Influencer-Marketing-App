"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    <span>
      <button onClick={handleRetry} disabled={submitting} style={{ padding: "2px 10px", fontSize: 12 }}>
        {submitting ? "Retrying…" : "Retry"}
      </button>
      {error && <div style={{ color: "crimson", fontSize: 11 }}>{error}</div>}
    </span>
  );
}
