"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormField, TextInput } from "../../../components/ui/Form";
import { Button } from "../../../components/ui/Button";
import { Alert } from "../../../components/ui/Alert";

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
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        <FormField label="Name" htmlFor="displayName" required>
          <TextInput id="displayName" type="text" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </FormField>
        <FormField label="Channel URL" htmlFor="channelUrl">
          <TextInput id="channelUrl" type="text" value={channelUrl} onChange={(e) => setChannelUrl(e.target.value)} />
        </FormField>
        <FormField label="Niche" htmlFor="niche">
          <TextInput id="niche" type="text" value={niche} onChange={(e) => setNiche(e.target.value)} />
        </FormField>
        <FormField label="Country" htmlFor="country">
          <TextInput id="country" type="text" value={country} onChange={(e) => setCountry(e.target.value)} />
        </FormField>
        <FormField label="Contact email" htmlFor="contactEmail">
          <TextInput id="contactEmail" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        </FormField>
      </div>
      {error && (
        <div className="mb-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <Button type="submit" variant="primary" disabled={submitting}>
        {submitting ? "Adding…" : "Add creator"}
      </Button>
    </form>
  );
}
