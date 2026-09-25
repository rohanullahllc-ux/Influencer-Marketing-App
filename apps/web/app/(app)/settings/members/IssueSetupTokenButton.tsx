"use client";

import { useState } from "react";
import { Button } from "../../../../components/ui/Button";
import { Alert } from "../../../../components/ui/Alert";

/** Client-side action: calls the setup-token API and displays the one-time link exactly once (plan §5). */
export function IssueSetupTokenButton({ userId, email }: { userId: string; email: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);

  async function handleClick() {
    setIssuing(true);
    setError(null);
    const res = await fetch(`/api/workspace-members/${userId}/setup-token`, { method: "POST" });
    setIssuing(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to issue setup token.");
      return;
    }

    const { token } = await res.json();
    const url = `${window.location.origin}/setup-account?token=${encodeURIComponent(token)}`;
    setLink(url);
  }

  if (link) {
    return (
      <div className="max-w-xs">
        <p className="mb-1 text-meta text-ink-subtle">Relay this link to {email} (shown once):</p>
        <code className="block break-all rounded-control bg-surface-muted px-2 py-1 text-meta text-ink">{link}</code>
      </div>
    );
  }

  return (
    <div>
      <Button variant="secondary" size="sm" onClick={handleClick} disabled={issuing}>
        {issuing ? "Issuing…" : "Issue setup link"}
      </Button>
      {error && (
        <div className="mt-2 max-w-xs">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
    </div>
  );
}
