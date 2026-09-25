"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Creator, CampaignCreator } from "@rdv/domain";

/** Wave 2 Phase 4 (plan §9): adds a workspace creator to this campaign's shortlist. */
export function ShortlistPanel({
  campaignId,
  allCreators,
  shortlisted,
}: {
  campaignId: string;
  allCreators: Creator[];
  shortlisted: CampaignCreator[];
}) {
  const router = useRouter();
  const shortlistedIds = new Set(shortlisted.map((s) => s.creatorId));
  const available = allCreators.filter((c) => !shortlistedIds.has(c.id));
  const [creatorId, setCreatorId] = useState(available[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!creatorId) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/campaigns/${campaignId}/creators`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creatorId }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to add creator.");
      return;
    }
    router.refresh();
  }

  const byId = new Map(allCreators.map((c) => [c.id, c]));

  return (
    <div>
      {shortlisted.length === 0 ? (
        <p style={{ color: "#666" }}>No creators shortlisted yet.</p>
      ) : (
        <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%", marginBottom: 16 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
              <th>Creator</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {shortlisted.map((s) => {
              const c = byId.get(s.creatorId);
              return (
                <tr key={s.creatorId} style={{ borderBottom: "1px solid #eee" }}>
                  <td>{c?.displayName ?? s.creatorId}</td>
                  <td>{s.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {available.length === 0 ? (
        <p style={{ color: "#666", fontSize: 13 }}>
          No more workspace creators to add. <a href="/creators">Discover or add creators</a> first.
        </p>
      ) : (
        <form onSubmit={handleAdd} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={creatorId} onChange={(e) => setCreatorId(e.target.value)} style={{ padding: 8 }}>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName ?? c.id}
              </option>
            ))}
          </select>
          <button type="submit" disabled={submitting} style={{ padding: "8px 16px" }}>
            {submitting ? "Adding…" : "Add to shortlist"}
          </button>
        </form>
      )}
      {error && <p style={{ color: "crimson", fontSize: 13 }}>{error}</p>}
    </div>
  );
}
