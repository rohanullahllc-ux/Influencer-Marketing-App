"use client";

import { useEffect, useRef, useState } from "react";
import type { Creator, OutreachSend } from "@rdv/domain";

const POLL_INTERVAL_MS = 2000;
const NON_TERMINAL: OutreachSend["status"][] = ["scheduled", "sending"];

const STATUS_COLOR: Record<string, string> = {
  scheduled: "#666",
  sending: "#b8860b",
  sent: "green",
  failed: "crimson",
  unknown: "#b8860b",
  blocked: "crimson",
  cancelled: "#999",
};

/**
 * Wave 3: real send history/status for this campaign — approving a
 * message on /approvals and clicking "Schedule send" there is what
 * creates these rows; this panel is read-only status, polled while any
 * row is still in flight (scheduled/sending).
 */
export function SendsPanel({ campaignId, shortlistedCreators }: { campaignId: string; shortlistedCreators: Creator[] }) {
  const [sends, setSends] = useState<OutreachSend[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchOnce() {
    const res = await fetch(`/api/campaigns/${campaignId}/sends`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to load sends.");
      return;
    }
    const rows: OutreachSend[] = await res.json();
    setSends(rows);
  }

  useEffect(() => {
    void fetchOnce();
    pollTimer.current = setInterval(() => void fetchOnce(), POLL_INTERVAL_MS);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  const byId = new Map(shortlistedCreators.map((c) => [c.id, c]));
  const anyInFlight = sends?.some((s) => NON_TERMINAL.includes(s.status)) ?? false;

  return (
    <div>
      {error && <p style={{ color: "crimson", fontSize: 13 }}>{error}</p>}
      {!sends || sends.length === 0 ? (
        <p style={{ color: "#666" }}>
          No sends yet. Approve a message on <a href="/approvals">/approvals</a> and use &quot;Schedule send&quot; there.
        </p>
      ) : (
        <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
              <th>Creator</th>
              <th>Step</th>
              <th>Status</th>
              <th>Detail</th>
              <th>Provider message id</th>
            </tr>
          </thead>
          <tbody>
            {sends.map((s) => (
              <tr key={s.id} style={{ borderBottom: "1px solid #eee" }}>
                <td>{byId.get(s.creatorId)?.displayName ?? s.creatorId}</td>
                <td style={{ fontSize: 12 }}>{s.outreachStep}</td>
                <td style={{ color: STATUS_COLOR[s.status] ?? "#333", fontWeight: 600 }}>{s.status.toUpperCase()}</td>
                <td style={{ fontSize: 12, color: "#666" }}>{s.statusReason ?? "—"}</td>
                <td style={{ fontSize: 12 }}>{s.providerMessageId ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {anyInFlight && <p style={{ fontSize: 12, color: "#666", marginTop: 8 }}>Polling every 2s while any send is still in flight…</p>}
    </div>
  );
}
