"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductIntelligence } from "@rdv/domain";

// Reuses the actual @rdv/domain entity type rather than a hand-duplicated
// interface, so this component can never silently drift from the real
// product_intelligence row shape.
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

const STATUS_COLOR: Record<Version["status"], string> = {
  draft: "#b8860b",
  approved: "green",
  superseded: "#999",
};

/**
 * Wave 2 Phase 2 (plan §7, §14.2): one Product Intelligence version —
 * read-only display, plus (for a draft, when the caller has the role)
 * inline edit and an explicit Approve action. Editing never touches
 * origin/status/approved_* — only the content fields + edited_by/
 * edited_at change, exactly as the API enforces server-side.
 */
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
    <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontWeight: 600, color: STATUS_COLOR[version.status] }}>{version.status.toUpperCase()}</span>
        <span style={{ fontSize: 12, color: "#666" }}>origin: {version.origin}</span>
      </div>
      <p style={{ fontSize: 12, color: "#666", margin: "4px 0" }}>
        Generated {new Date(version.generatedAt).toLocaleString()}
        {version.editedAt && ` · edited ${new Date(version.editedAt).toLocaleString()}`}
        {version.approvedAt && ` · approved ${new Date(version.approvedAt).toLocaleString()}`}
      </p>

      {editing ? (
        <form onSubmit={handleSave}>
          {ARRAY_FIELDS.map(({ key, label }) => (
            <div key={key} style={{ marginBottom: 8 }}>
              <label style={{ display: "block", fontSize: 13, marginBottom: 2 }}>{label} (comma-separated)</label>
              <input
                type="text"
                value={fields[key]}
                onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
                style={{ width: "100%", padding: 6 }}
              />
            </div>
          ))}
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: "block", fontSize: 13, marginBottom: 2 }}>Audience rationale</label>
            <textarea
              value={audienceRationale}
              onChange={(e) => setAudienceRationale(e.target.value)}
              rows={3}
              style={{ width: "100%", padding: 6 }}
            />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: "block", fontSize: 13, marginBottom: 2 }}>Confidence (0-1)</label>
            <input
              type="text"
              value={confidence}
              onChange={(e) => setConfidence(e.target.value)}
              style={{ width: 120, padding: 6 }}
            />
          </div>
          {error && <p style={{ color: "crimson" }}>{error}</p>}
          <button type="submit" disabled={submitting} style={{ padding: "6px 14px", marginRight: 8 }}>
            {submitting ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={() => setEditing(false)} style={{ padding: "6px 14px" }}>
            Cancel
          </button>
        </form>
      ) : (
        <>
          {ARRAY_FIELDS.map(({ key, label }) => {
            const value = (version[key] as string[] | null) ?? [];
            if (value.length === 0) return null;
            return (
              <p key={key} style={{ fontSize: 13, margin: "4px 0" }}>
                <strong>{label}:</strong> {value.join(", ")}
              </p>
            );
          })}
          {version.audienceRationale && (
            <p style={{ fontSize: 13, margin: "4px 0" }}>
              <strong>Rationale:</strong> {version.audienceRationale}
            </p>
          )}
          {version.confidence && (
            <p style={{ fontSize: 13, margin: "4px 0" }}>
              <strong>Confidence:</strong> {version.confidence}
            </p>
          )}
          {error && <p style={{ color: "crimson" }}>{error}</p>}
          {isDraft && canEdit && (
            <button onClick={() => setEditing(true)} style={{ padding: "6px 14px", marginRight: 8, marginTop: 8 }}>
              Edit
            </button>
          )}
          {isDraft && canApprove && (
            <button onClick={handleApprove} disabled={submitting} style={{ padding: "6px 14px", marginTop: 8 }}>
              {submitting ? "Approving…" : "Approve"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
