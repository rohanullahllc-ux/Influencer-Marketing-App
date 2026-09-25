"use client";

import { useState } from "react";

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
      <div style={{ fontSize: 13 }}>
        <p style={{ margin: "4px 0" }}>Relay this link to {email} (shown once):</p>
        <code style={{ wordBreak: "break-all" }}>{link}</code>
      </div>
    );
  }

  return (
    <div>
      <button onClick={handleClick} disabled={issuing} style={{ padding: "4px 10px" }}>
        {issuing ? "Issuing…" : "Issue setup link"}
      </button>
      {error && <p style={{ color: "crimson", fontSize: 13 }}>{error}</p>}
    </div>
  );
}
