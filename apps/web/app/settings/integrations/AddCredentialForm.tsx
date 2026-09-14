"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AddCredentialForm() {
  const router = useRouter();
  const [provider, setProvider] = useState("youtube");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, apiKey }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to store key.");
      return;
    }

    setApiKey("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 400 }}>
      <div style={{ marginBottom: 12 }}>
        <label htmlFor="provider" style={{ display: "block", marginBottom: 4 }}>
          Provider
        </label>
        <select
          id="provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          style={{ width: "100%", padding: 8 }}
        >
          <option value="youtube">YouTube Data API</option>
          <option value="anthropic">Anthropic API</option>
        </select>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label htmlFor="apiKey" style={{ display: "block", marginBottom: 4 }}>
          API key
        </label>
        <input
          id="apiKey"
          type="password"
          required
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          style={{ width: "100%", padding: 8 }}
        />
      </div>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <button type="submit" disabled={submitting} style={{ padding: "8px 16px" }}>
        {submitting ? "Saving…" : "Save key"}
      </button>
    </form>
  );
}
