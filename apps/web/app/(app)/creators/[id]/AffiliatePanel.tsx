"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CreatorAffiliate, WhopConversion } from "@rdv/domain";
import { Button } from "../../../../components/ui/Button";
import { Alert } from "../../../../components/ui/Alert";
import { StatusBadge, toneForStatus } from "../../../../components/ui/StatusBadge";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { Table, Thead, Th, Tr, Td } from "../../../../components/ui/Table";

const POLL_INTERVAL_MS = 2000;
const TERMINAL_STATUSES = new Set(["active", "failed", "unknown", "revoked"]);

export function AffiliatePanel({ creatorId, initialAffiliates }: { creatorId: string; initialAffiliates: CreatorAffiliate[] }) {
  const router = useRouter();
  const current = initialAffiliates[0] ?? null;
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversions, setConversions] = useState<WhopConversion[]>([]);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (current?.status === "active") {
      fetch(`/api/creators/affiliates/${current.id}/conversions`)
        .then((r) => (r.ok ? r.json() : []))
        .then(setConversions)
        .catch(() => {});
    }
  }, [current?.id, current?.status]);

  useEffect(() => {
    if (current && !TERMINAL_STATUSES.has(current.status)) {
      pollTimer.current = setInterval(async () => {
        const res = await fetch(`/api/creators/affiliates/${current.id}`);
        if (!res.ok) return;
        const updated = await res.json();
        if (TERMINAL_STATUSES.has(updated.status)) {
          if (pollTimer.current) clearInterval(pollTimer.current);
          router.refresh();
        }
      }, POLL_INTERVAL_MS);
      return () => {
        if (pollTimer.current) clearInterval(pollTimer.current);
      };
    }
  }, [current?.id, current?.status, router]);

  async function handleRequest() {
    setRequesting(true);
    setError(null);
    const res = await fetch(`/api/creators/${creatorId}/affiliate`, { method: "POST" });
    setRequesting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to request affiliate creation.");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      {current ? (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <StatusBadge label={current.status} tone={toneForStatus(current.status)} />
            {current.statusReason && <span className="text-supporting text-ink-subtle">{current.statusReason}</span>}
          </div>
          {current.status === "active" && (
            <>
              <p className="mb-3 text-supporting text-ink">
                Affiliate code: <strong className="text-ink">{current.affiliateCode}</strong>{" "}
                <span className="text-ink-faint">(provider id: {current.providerAffiliateId})</span>
              </p>
              {conversions.length === 0 ? (
                <EmptyState title="No conversions recorded yet" />
              ) : (
                <Table>
                  <Thead>
                    <Th>Type</Th>
                    <Th>When</Th>
                    <Th>Amount</Th>
                  </Thead>
                  <tbody>
                    {conversions.map((c) => (
                      <Tr key={c.id}>
                        <Td>
                          <StatusBadge label={c.eventType} tone="success" />
                        </Td>
                        <Td className="text-ink-subtle">{new Date(c.occurredAt).toLocaleString()}</Td>
                        <Td className="font-medium">{c.amount ? `${c.amount} ${c.currency ?? ""}` : "—"}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </>
          )}
          {!TERMINAL_STATUSES.has(current.status) && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-supporting text-ink-subtle">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary-500" />
              Waiting on the provider…
            </p>
          )}
        </div>
      ) : (
        <div>
          <div className="mb-3">
            <EmptyState title="No affiliate relationship yet" />
          </div>
          <Button variant="primary" onClick={handleRequest} disabled={requesting}>
            {requesting ? "Requesting…" : "Request affiliate creation"}
          </Button>
        </div>
      )}
      {error && (
        <div className="mt-2">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
    </div>
  );
}
