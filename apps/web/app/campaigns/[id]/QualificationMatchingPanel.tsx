"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Creator, CreatorQualification, CreatorMatch } from "@rdv/domain";

const POLL_INTERVAL_MS = 2000;

/**
 * Wave 2 Phase 5 (plan §10): shows each shortlisted creator's current
 * qualification (deterministic pass/fail, with reasons) and current AI
 * match (score + explanation — a score is never shown without it). The
 * two are always displayed as separate, independent results — matching
 * is never used to override or substitute for qualification.
 */
export function QualificationMatchingPanel({
  campaignId,
  shortlistedCreators,
  initialQualifications,
  initialMatches,
}: {
  campaignId: string;
  shortlistedCreators: Creator[];
  initialQualifications: CreatorQualification[];
  initialMatches: CreatorMatch[];
}) {
  const router = useRouter();
  const [qualifying, setQualifying] = useState(false);
  const [matching, setMatching] = useState(false);
  const [matchState, setMatchState] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  function stopPolling() {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }

  async function handleQualify() {
    setQualifying(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/qualify`, { method: "POST" });
    setQualifying(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to run qualification.");
      return;
    }
    router.refresh();
  }

  async function pollMatch(runId: string) {
    const res = await fetch(`/api/campaigns/${campaignId}/match/${runId}`);
    if (!res.ok) {
      stopPolling();
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to check matching run status.");
      return;
    }
    const status = await res.json();
    setMatchState(status.state);
    if (status.state === "completed" || status.state === "failed") {
      stopPolling();
      if (status.state === "failed") setError(`Matching run failed: ${status.failedReason}`);
      router.refresh();
    }
  }

  async function handleMatch() {
    setMatching(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/match`, { method: "POST" });
    setMatching(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to start matching.");
      return;
    }
    const { jobId } = await res.json();
    setMatchState("waiting");
    stopPolling();
    pollTimer.current = setInterval(() => void pollMatch(jobId), POLL_INTERVAL_MS);
    void pollMatch(jobId);
  }

  const qualificationByCreator = new Map(initialQualifications.map((q) => [q.creatorId, q]));
  const matchByCreator = new Map(initialMatches.map((m) => [m.creatorId, m]));

  return (
    <div>
      <div style={{ marginBottom: 16, display: "flex", gap: 8 }}>
        <button onClick={handleQualify} disabled={qualifying || shortlistedCreators.length === 0} style={{ padding: "8px 16px" }}>
          {qualifying ? "Qualifying…" : "Run Qualification"}
        </button>
        <button onClick={handleMatch} disabled={matching || shortlistedCreators.length === 0} style={{ padding: "8px 16px" }}>
          {matching ? "Starting…" : "Run AI Matching"}
        </button>
        {matchState && matchState !== "completed" && matchState !== "failed" && (
          <span style={{ fontSize: 13, color: "#666", alignSelf: "center" }}>Matching: {matchState}…</span>
        )}
      </div>
      {error && <p style={{ color: "crimson", fontSize: 13 }}>{error}</p>}
      {shortlistedCreators.length === 0 ? (
        <p style={{ color: "#666" }}>Shortlist a creator above before running qualification/matching.</p>
      ) : (
        <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
              <th>Creator</th>
              <th>Qualification</th>
              <th>Match score</th>
              <th>Explanation</th>
            </tr>
          </thead>
          <tbody>
            {shortlistedCreators.map((c) => {
              const q = qualificationByCreator.get(c.id);
              const m = matchByCreator.get(c.id);
              return (
                <tr key={c.id} style={{ borderBottom: "1px solid #eee", verticalAlign: "top" }}>
                  <td>{c.displayName ?? c.id}</td>
                  <td>
                    {q ? (
                      <span style={{ color: q.passed ? "green" : "crimson" }}>
                        {q.passed ? "PASS" : "FAIL"}
                        {!q.passed && (q.measuredValues as { reasons?: string[] } | null)?.reasons && (
                          <div style={{ fontSize: 12, color: "#666" }}>
                            {((q.measuredValues as { reasons?: string[] }).reasons ?? []).join("; ")}
                          </div>
                        )}
                      </span>
                    ) : (
                      <span style={{ color: "#999" }}>not evaluated</span>
                    )}
                  </td>
                  <td>{m ? Number(m.score).toFixed(2) : <span style={{ color: "#999" }}>—</span>}</td>
                  <td style={{ fontSize: 13 }}>{m ? m.explanation : <span style={{ color: "#999" }}>—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
