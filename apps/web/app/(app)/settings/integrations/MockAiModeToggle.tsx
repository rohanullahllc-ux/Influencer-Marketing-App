"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../../../../components/ui/Button";
import { Alert } from "../../../../components/ui/Alert";

export function MockAiModeToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle() {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/settings/ai-mock-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !initialEnabled }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to update Mock AI mode.");
      return;
    }

    router.refresh();
  }

  return (
    <div>
      <Button variant={initialEnabled ? "secondary" : "primary"} onClick={handleToggle} disabled={submitting}>
        {submitting ? "Updating…" : initialEnabled ? "Turn Mock AI mode off" : "Turn Mock AI mode on"}
      </Button>
      {error && (
        <div className="mt-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
    </div>
  );
}
