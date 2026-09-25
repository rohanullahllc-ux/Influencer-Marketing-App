"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CreatorAffiliate, WhopConversion } from "@rdv/domain";

const POLL_INTERVAL_MS = 2000;
const TERMINAL_STATUSES = new Set(["active", "failed", "unknown", "revoked"]);

/**
 * Wave 4 (Whop Affiliate/Conversion): human-triggered only. The durable
 * creator_affiliates row (not a BullMQ job id) is what's polled, same
 * pattern as outreach sends — a real Whop call may not resolve instantly.
 */
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
        <div style={{ fontSize: 13, marginBottom: 12 }}>
          <p>
            Status: <strong>{current.status}</strong>
            {current.statusReason && <span style={{ color: "#666" }}> — {current.statusReason}</span>}
          </p>
          {current.status === "active" && (
            <>
              <p>
                Affiliate code: <strong>{current.affiliateCode}</strong> (provider id: {current.providerAffiliateId})
              </p>
              {conversions.length === 0 ? (
                <p style={{ color: "#666" }}>No conversions recorded yet.</p>
              ) : (
                <table cellPadding={4} style={{ borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
                      <th>Type</th>
                      <th>When</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conversions.map((c) => (
                      <tr key={c.id} style={{ borderBottom: "1px solid #eee" }}>
                        <td>{c.eventType}</td>
                        <td>{new Date(c.occurredAt).toLocaleString()}</td>
                        <td>{c.amount ? `${c.amount} ${c.currency ?? ""}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
          {!TERMINAL_STATUSES.has(current.status) && <p style={{ color: "#666" }}>Waiting on the provider…</p>}
        </div>
      ) : (
        <div>
          <p style={{ color: "#666", marginBottom: 8 }}>No affiliate relationship yet.</p>
          <button onClick={handleRequest} disabled={requesting} style={{ padding: "6px 12px" }}>
            {requesting ? "Requesting…" : "Request affiliate creation"}
          </button>
        </div>
      )}
      {error && <p style={{ color: "crimson", fontSize: 13, marginTop: 4 }}>{error}</p>}
    </div>
  );
}
