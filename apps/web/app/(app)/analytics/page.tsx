import { getWorkspaceAnalytics } from "@rdv/domain";
import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../../lib/session";

function CountTable({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts);
  if (entries.length === 0) return <p style={{ color: "#999", margin: 0 }}>none yet</p>;
  return (
    <table cellPadding={4} style={{ fontSize: 13 }}>
      <tbody>
        {entries.map(([k, v]) => (
          <tr key={k}>
            <td style={{ color: "#666" }}>{k.replace(/_/g, " ")}</td>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 18, marginBottom: 8 }}>{title}</h2>
      {children}
    </section>
  );
}

/**
 * Wave 5 (Analytics): the workspace-wide observed-data dashboard. Every
 * number is computed live, directly from stored rows, on this request —
 * never cached, never predicted, never a placeholder. Observed counts
 * (e.g. "3 sent") are shown plainly; a derived rate is only ever shown
 * next to the sample size it was computed from, so a tiny sample never
 * reads with the same confidence as a large one.
 */
export default async function AnalyticsPage() {
  let actor;
  try {
    actor = await requireSession();
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return (
        <main style={{ padding: 32 }}>
          <p>
            You must <a href="/login">sign in</a> to view this page.
          </p>
        </main>
      );
    }
    throw err;
  }

  const s = await getWorkspaceAnalytics({ workspaceId: actor.workspaceId, actorUserId: actor.userId });

  return (
    <main style={{ padding: 32, maxWidth: 760 }}>
      <h1>Analytics</h1>
      <p style={{ fontSize: 13, color: "#666" }}>
        Every number below is a real, observed count from this workspace's stored data as of{" "}
        {new Date(s.generatedAt).toLocaleString()} — nothing here is predicted or estimated.
      </p>

      <Section title="Product">
        <p>
          {s.products.total} product{s.products.total === 1 ? "" : "s"}, {s.products.withApprovedIntelligence} with
          approved AI Product Intelligence.
        </p>
      </Section>

      <Section title="Discovery">
        <p>{s.discovery.totalCreators} creators total.</p>
        <p style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>By provenance:</p>
        <CountTable counts={s.discovery.byProvenance} />
        <p style={{ fontSize: 13, color: "#666", margin: "8px 0 4px" }}>By source:</p>
        <CountTable counts={s.discovery.bySource} />
      </Section>

      <Section title="Qualification">
        <p>
          {s.qualification.totalCurrentlyEvaluated} currently evaluated — {s.qualification.passed} passed,{" "}
          {s.qualification.failed} failed.
        </p>
        {s.qualification.topFailureReasons.length > 0 && (
          <>
            <p style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>Most common failure reasons:</p>
            <ul style={{ fontSize: 13, marginTop: 0 }}>
              {s.qualification.topFailureReasons.map((r) => (
                <li key={r.reason}>
                  {r.reason} ({r.count})
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section title="Matching">
        <p>
          {s.matching.totalCurrentlyMatched} currently matched.
          {s.matching.averageScore !== null ? (
            <>
              {" "}
              Average score {s.matching.averageScore.toFixed(2)} (from {s.matching.sampleSize} match
              {s.matching.sampleSize === 1 ? "" : "es"}
              {s.matching.sampleSize < 5 ? " — small sample, treat with caution" : ""}).
            </>
          ) : (
            " No matches yet."
          )}
        </p>
      </Section>

      <Section title="Campaigns">
        <p>
          {s.campaigns.total} campaign{s.campaigns.total === 1 ? "" : "s"}, {s.campaigns.totalShortlistEntries}{" "}
          shortlist entries total.
        </p>
        <p style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>By status:</p>
        <CountTable counts={s.campaigns.byStatus} />
        <p style={{ fontSize: 13, color: "#666", margin: "8px 0 4px" }}>Shortlist by status:</p>
        <CountTable counts={s.campaigns.byShortlistStatus} />
      </Section>

      <Section title="Outreach">
        <p>{s.outreach.totalDrafts} drafts generated.</p>
        <p style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>By draft status:</p>
        <CountTable counts={s.outreach.byDraftStatus} />
        <p style={{ fontSize: 13, color: "#666", margin: "8px 0 4px" }}>By approval status:</p>
        <CountTable counts={s.outreach.byApprovalStatus} />
      </Section>

      <Section title="Sends">
        <p>{s.sends.total} sends recorded (against the Mock outreach provider until a real one is selected).</p>
        <CountTable counts={s.sends.byStatus} />
      </Section>

      <Section title="Replies">
        <p>{s.replies.total} inbound replies, {s.replies.suggestedResponsesDrafted} with an AI-suggested response drafted.</p>
        <p style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>By match status:</p>
        <CountTable counts={s.replies.byMatchStatus} />
        <p style={{ fontSize: 13, color: "#666", margin: "8px 0 4px" }}>By classification:</p>
        <CountTable counts={s.replies.byClassification} />
      </Section>

      <Section title="Creator CRM">
        <p>
          {s.crm.openTasks} open task{s.crm.openTasks === 1 ? "" : "s"} of {s.crm.totalTasks} total, {s.crm.totalNotes}{" "}
          note{s.crm.totalNotes === 1 ? "" : "s"}.
        </p>
        <p style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>By relationship status:</p>
        <CountTable counts={s.crm.byRelationshipStatus} />
      </Section>

      <Section title="Whop affiliate / conversion">
        <p>{s.whop.affiliates.total} affiliate relationship(s) requested (against the Mock Whop provider until real credentials exist).</p>
        <CountTable counts={s.whop.affiliates.byStatus} />
        <p style={{ marginTop: 8 }}>{s.whop.conversions.total} conversion event(s) recorded.</p>
        <CountTable counts={s.whop.conversions.byEventType} />
        {s.whop.conversions.revenueByCurrency.length > 0 && (
          <>
            <p style={{ fontSize: 13, color: "#666", margin: "8px 0 4px" }}>Attributable revenue (order/conversion events only, never mixed across currencies):</p>
            <ul style={{ fontSize: 13, marginTop: 0 }}>
              {s.whop.conversions.revenueByCurrency.map((r) => (
                <li key={r.currency}>
                  {r.total.toFixed(2)} {r.currency}
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>
    </main>
  );
}
