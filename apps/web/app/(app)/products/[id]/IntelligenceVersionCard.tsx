"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductIntelligence } from "@rdv/domain";
import { Card } from "../../../../components/ui/Card";
import { StatusBadge, toneForStatus } from "../../../../components/ui/StatusBadge";
import { Button } from "../../../../components/ui/Button";
import { Alert } from "../../../../components/ui/Alert";
import { FormField, TextInput, TextArea } from "../../../../components/ui/Form";

type Version = ProductIntelligence;

const ARRAY_FIELDS: { key: keyof Version; label: string }[] = [
  { key: "idealCustomer", label: "Ideal customer" },
  { key: "problems", label: "Problems solved" },
  { key: "benefits", label: "Benefits" },
  { key: "niches", label: "Niches" },
  { key: "subNiches", label: "Sub-niches" },
  { key: "creatorTypes", label: "Creator types" },
  { key: "countries", label: "Countries" },
  { key: "languages", label: "Languages" },
  { key: "topics", label: "Topics" },
  { key: "keywords", label: "Keywords" },
];

export function IntelligenceVersionCard({
  version,
  productId,
  canEdit,
  canApprove,
}: {
  version: Version;
  productId: string;
  canEdit: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>(() =>
    Object.fromEntries(ARRAY_FIELDS.map(({ key }) => [key, (version[key] as string[] | null)?.join(", ") ?? ""]))
  );
  const [audienceRationale, setAudienceRationale] = useState(version.audienceRationale ?? "");
  const [confidence, setConfidence] = useState(version.confidence ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isDraft = version.status === "draft";

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const patch: Record<string, unknown> = { audienceRationale };
    for (const { key } of ARRAY_FIELDS) {
      patch[key] = fields[key]
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
    const parsedConfidence = Number(confidence);
    if (!Number.isNaN(parsedConfidence)) {
      patch.confidence = parsedConfidence;
    }

    const res = await fetch(`/api/products/${productId}/intelligence/${version.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to save edits.");
      return;
    }

    setEditing(false);
    router.refresh();
  }

  async function handleApprove() {
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/products/${productId}/intelligence/${version.id}/approve`, { method: "POST" });
    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to approve.");
      return;
    }

    router.refresh();
  }

  return (
    <Card
      title={<StatusBadge label={version.status} tone={toneForStatus(version.status)} />}
      actions={<span className="text-meta text-ink-faint">origin: {version.origin}</span>}
    >
      <p className="mb-3 text-meta text-ink-faint">
        Generated {new Date(version.generatedAt).toLocaleString()}
        {version.editedAt && ` · edited ${new Date(version.editedAt).toLocaleString()}`}
        {version.approvedAt && ` · approved ${new Date(version.approvedAt).toLocaleString()}`}
      </p>

      {editing ? (
        <form onSubmit={handleSave}>
          {ARRAY_FIELDS.map(({ key, label }) => (
            <FormField key={key} label={`${label} (comma-separated)`} htmlFor={key}>
              <TextInput
                id={key}
                type="text"
                value={fields[key]}
                onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
              />
            </FormField>
          ))}
          <FormField label="Audience rationale" htmlFor="audienceRationale">
            <TextArea
              id="audienceRationale"
              value={audienceRationale}
              onChange={(e) => setAudienceRationale(e.target.value)}
              rows={3}
            />
          </FormField>
          <FormField label="Confidence (0-1)" htmlFor="confidence">
            <TextInput
              id="confidence"
              type="text"
              className="w-32"
              value={confidence}
              onChange={(e) => setConfidence(e.target.value)}
            />
          </FormField>
          {error && (
            <div className="mb-3">
              <Alert tone="danger">{error}</Alert>
            </div>
          )}
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            {ARRAY_FIELDS.map(({ key, label }) => {
              const value = (version[key] as string[] | null) ?? [];
              if (value.length === 0) return null;
              return (
                <p key={key} className="text-supporting text-ink">
                  <strong className="text-ink">{label}:</strong> {value.join(", ")}
                </p>
              );
            })}
            {version.audienceRationale && (
              <p className="text-supporting text-ink">
                <strong className="text-ink">Rationale:</strong> {version.audienceRationale}
              </p>
            )}
            {version.confidence && (
              <p className="text-supporting text-ink">
                <strong className="text-ink">Confidence:</strong> {version.confidence}
              </p>
            )}
          </div>
          {error && (
            <div className="mt-3">
              <Alert tone="danger">{error}</Alert>
            </div>
          )}
          {(isDraft && (canEdit || canApprove)) && (
            <div className="mt-4 flex gap-2">
              {isDraft && canEdit && (
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              )}
              {isDraft && canApprove && (
                <Button variant="primary" onClick={handleApprove} disabled={submitting}>
                  {submitting ? "Approving…" : "Approve"}
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
