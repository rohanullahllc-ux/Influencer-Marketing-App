"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OutreachTemplate, CampaignTemplate } from "@rdv/domain";

/** Wave 2 Phase 4 (plan §9): assigns one template per segment to this campaign — simple V1 dimension, not A/B testing. */
export function TemplateAssignmentPanel({
  campaignId,
  allTemplates,
  assignments,
}: {
  campaignId: string;
  allTemplates: OutreachTemplate[];
  assignments: CampaignTemplate[];
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(allTemplates[0]?.id ?? "");
  const [segment, setSegment] = useState("default");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!templateId || !segment) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/campaigns/${campaignId}/templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId, assignmentSegment: segment }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to assign template.");
      return;
    }
    router.refresh();
  }

  const templateById = new Map(allTemplates.map((t) => [t.id, t]));

  return (
    <div>
      {assignments.length === 0 ? (
        <p style={{ color: "#666" }}>No templates assigned yet.</p>
      ) : (
        <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%", marginBottom: 16 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
              <th>Segment</th>
              <th>Template</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr key={a.id} style={{ borderBottom: "1px solid #eee" }}>
                <td>{a.assignmentSegment}</td>
                <td>{templateById.get(a.templateId)?.name ?? a.templateId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {allTemplates.length === 0 ? (
        <p style={{ color: "#666", fontSize: 13 }}>
          No templates exist yet. <a href="/templates/new">Create one</a> first.
        </p>
      ) : (
        <form onSubmit={handleAssign} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} style={{ padding: 8 }}>
            {allTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={segment}
            onChange={(e) => setSegment(e.target.value)}
            placeholder="segment (e.g. default, top-tier)"
            style={{ padding: 8 }}
          />
          <button type="submit" disabled={submitting} style={{ padding: "8px 16px" }}>
            {submitting ? "Assigning…" : "Assign"}
          </button>
        </form>
      )}
      {error && <p style={{ color: "crimson", fontSize: 13 }}>{error}</p>}
    </div>
  );
}
