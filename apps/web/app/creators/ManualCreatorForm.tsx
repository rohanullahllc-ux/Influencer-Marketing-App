"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Wave 2 Phase 3 (plan §8): manual creator entry — POST /api/creators, tagged provenance: human_entered by the API. */
export function ManualCreatorForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [channelUrl, setChannelUrl] = useState("");
  const [niche, setNiche] = useState("");
  const [country, setCountry] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/creators", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName,
        channelUrl: channelUrl || undefined,
        niche: niche || undefined,
        country: country || undefined,
        contactEmail: contactEmail || undefined,
      }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to add creator.");
      return;
    }

    setDisplayName("");
    setChannelUrl("");
    setNiche("");
    setCountry("");
    setContactEmail("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
      <div style={{ marginBottom: 10 }}>
        <label htmlFor="displayName" style={{ display: "block", marginBottom: 4 }}>
          Name
        </label>
        <input
          id="displayName"
          type="text"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          style={{ width: "100%", padding: 8 }}
        />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label htmlFor="channelUrl" style={{ display: "block", marginBottom: 4 }}>
          Channel URL
        </label>
        <input
          id="channelUrl"
          type="text"
          value={channelUrl}
          onChange={(e) => setChannelUrl(e.target.value)}
          style={{ width: "100%", padding: 8 }}
        />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label htmlFor="niche" style={{ display: "block", marginBottom: 4 }}>
          Niche
        </label>
        <input
          id="niche"
          type="text"
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
          style={{ width: "100%", padding: 8 }}
        />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label htmlFor="country" style={{ display: "block", marginBottom: 4 }}>
          Country
        </label>
        <input
          id="country"
          type="text"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          style={{ width: "100%", padding: 8 }}
        />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label htmlFor="contactEmail" style={{ display: "block", marginBottom: 4 }}>
          Contact email
        </label>
        <input
          id="contactEmail"
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          style={{ width: "100%", padding: 8 }}
        />
      </div>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <button type="submit" disabled={submitting} style={{ padding: "8px 16px" }}>
        {submitting ? "Adding…" : "Add creator"}
      </button>
    </form>
  );
}
