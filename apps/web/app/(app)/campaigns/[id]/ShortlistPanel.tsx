"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Creator, CampaignCreator } from "@rdv/domain";
import { Table, Thead, Th, Tr, Td } from "../../../../components/ui/Table";
import { Button } from "../../../../components/ui/Button";
import { Alert } from "../../../../components/ui/Alert";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { StatusBadge, toneForStatus } from "../../../../components/ui/StatusBadge";

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
        <div className="mb-4">
          <EmptyState title="No creators shortlisted yet" />
        </div>
      ) : (
        <div className="mb-4">
          <Table>
            <Thead>
              <Th>Creator</Th>
              <Th>Status</Th>
            </Thead>
            <tbody>
              {shortlisted.map((s) => {
                const c = byId.get(s.creatorId);
                return (
                  <Tr key={s.creatorId}>
                    <Td>{c?.displayName ?? s.creatorId}</Td>
                    <Td>
                      <StatusBadge label={s.status} tone={toneForStatus(s.status)} />
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      )}

      {available.length === 0 ? (
        <p className="text-supporting text-ink-subtle">
          No more workspace creators to add. <a href="/creators" className="text-primary-600 no-underline hover:underline">Discover or add creators</a>{" "}
          first.
        </p>
      ) : (
        <form onSubmit={handleAdd} className="flex items-center gap-2">
          <select
            value={creatorId}
            onChange={(e) => setCreatorId(e.target.value)}
            className="rounded-control border border-border-strong bg-white px-3 py-2 text-body text-ink focus-visible:focus-ring"
          >
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName ?? c.id}
              </option>
            ))}
          </select>
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? "Adding…" : "Add to shortlist"}
          </Button>
        </form>
      )}
      {error && (
        <div className="mt-2">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
    </div>
  );
}
