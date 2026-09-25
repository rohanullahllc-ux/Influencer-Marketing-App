"use client";

import { useEffect, useRef, useState } from "react";
import type { Creator, OutreachSend } from "@rdv/domain";
import { Table, Thead, Th, Tr, Td } from "../../../../components/ui/Table";
import { StatusBadge, toneForStatus } from "../../../../components/ui/StatusBadge";
import { Alert } from "../../../../components/ui/Alert";
import { EmptyState } from "../../../../components/ui/EmptyState";

const POLL_INTERVAL_MS = 2000;
const NON_TERMINAL: OutreachSend["status"][] = ["scheduled", "sending"];

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
      {error && (
        <div className="mb-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      {!sends || sends.length === 0 ? (
        <EmptyState
          title="No sends yet"
          description={
            <>
              Approve a message on <a href="/approvals" className="text-primary-600 no-underline hover:underline">/approvals</a> and use
              &quot;Schedule send&quot; there.
            </>
          }
        />
      ) : (
        <Table>
          <Thead>
            <Th>Creator</Th>
            <Th>Step</Th>
            <Th>Status</Th>
            <Th>Detail</Th>
            <Th>Provider message id</Th>
          </Thead>
          <tbody>
            {sends.map((s) => (
              <Tr key={s.id} className={s.status === "blocked" ? "bg-danger-50" : ""}>
                <Td>{byId.get(s.creatorId)?.displayName ?? s.creatorId}</Td>
                <Td className="text-meta text-ink-faint">{s.outreachStep}</Td>
                <Td>
                  <StatusBadge label={s.status === "blocked" ? "BLOCKED — suppressed" : s.status} tone={toneForStatus(s.status)} />
                </Td>
                <Td className="max-w-md whitespace-normal text-supporting text-ink-subtle">{s.statusReason ?? "—"}</Td>
                <Td className="text-meta text-ink-faint">{s.providerMessageId ?? "—"}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
      {anyInFlight && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-meta text-ink-faint">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-500" />
          Polling every 2s while any send is still in flight…
        </p>
      )}
    </div>
  );
}
