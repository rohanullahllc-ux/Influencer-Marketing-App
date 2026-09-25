import { getWorkspaceAnalytics, getCampaignAnalytics, listCampaigns } from "@rdv/domain";
import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../../lib/session";
import { PageHeader } from "../../../components/ui/PageHeader";
import { ButtonLink } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { MetricCard } from "../../../components/ui/MetricCard";
import { Card } from "../../../components/ui/Card";
import { StageBars } from "../../../components/ui/StageBars";
import { StatusBreakdown } from "../../../components/ui/StatusBreakdown";
import { Table, Thead, Th, Tr, Td } from "../../../components/ui/Table";

export default async function AnalyticsPage() {
  let actor;
  try {
    actor = await requireSession();
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return (
        <EmptyState
          title="Sign in required"
          description="You must sign in to view analytics."
          action={<ButtonLink href="/login" variant="primary">Sign in</ButtonLink>}
        />
      );
    }
    throw err;
  }

  const [s, campaigns] = await Promise.all([
    getWorkspaceAnalytics({ workspaceId: actor.workspaceId, actorUserId: actor.userId }),
    listCampaigns({ workspaceId: actor.workspaceId, actorUserId: actor.userId }),
  ]);

  const campaignRows = await Promise.all(
    campaigns.map(async (c) => ({
      campaign: c,
      analytics: await getCampaignAnalytics({ workspaceId: actor.workspaceId, actorUserId: actor.userId, campaignId: c.id }),
    }))
  );

  const approvedDrafts = s.outreach.byApprovalStatus.approved ?? 0;

  return (
    <div>
      <PageHeader
        title="Analytics"
        description={`Every number below is a real, observed count from this workspace's stored data as of ${new Date(s.generatedAt).toLocaleString()} — nothing here is predicted or estimated.`}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="Products" value={s.products.total} />
        <MetricCard label="Creators" value={s.discovery.totalCreators} />
        <MetricCard label="Campaigns" value={s.campaigns.total} />
        <MetricCard label="Qualified" value={s.qualification.passed} />
        <MetricCard label="Matched" value={s.matching.totalCurrentlyMatched} />
        <MetricCard label="Drafts" value={s.outreach.totalDrafts} />
        <MetricCard label="Approvals" value={approvedDrafts} />
        <MetricCard label="Sends" value={s.sends.total} />
        <MetricCard label="Replies" value={s.replies.total} />
        <MetricCard label="Affiliates" value={s.whop.affiliates.total} />
        <MetricCard label="Conversions" value={s.whop.conversions.total} />
        <MetricCard
          label="Revenue"
          value={s.whop.conversions.revenueByCurrency.length === 0 ? "$0" : s.whop.conversions.revenueByCurrency.map((r) => `${r.total.toFixed(2)} ${r.currency}`).join(", ")}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Pipeline stage counts">
          <p className="mb-3 text-supporting text-ink-subtle">
            Observed counts at each stage — not a strict cohort conversion, since populations differ by stage.
          </p>
          <StageBars
            stages={[
              { label: "Product", value: s.products.total },
              { label: "Discovery", value: s.discovery.totalCreators },
              { label: "Qualification", value: s.qualification.totalCurrentlyEvaluated },
              { label: "Matching", value: s.matching.totalCurrentlyMatched },
              { label: "Shortlist", value: s.campaigns.totalShortlistEntries },
              { label: "Draft", value: s.outreach.totalDrafts },
              { label: "Approval", value: approvedDrafts },
              { label: "Send", value: s.sends.total },
              { label: "Reply", value: s.replies.total },
              { label: "Affiliate", value: s.whop.affiliates.total },
              { label: "Conversion", value: s.whop.conversions.total },
            ]}
          />
        </Card>

        <Card title="Qualification">
          <p className="mb-3 text-supporting text-ink-subtle">
            {s.qualification.totalCurrentlyEvaluated} currently evaluated — {s.qualification.passed} passed, {s.qualification.failed} failed.
          </p>
          {s.qualification.topFailureReasons.length > 0 && (
            <>
              <p className="mb-1.5 text-label uppercase tracking-wide text-ink-faint">Most common failure reasons</p>
              <ul className="list-disc pl-5 text-supporting text-ink">
                {s.qualification.topFailureReasons.map((r) => (
                  <li key={r.reason}>
                    {r.reason} ({r.count})
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      {campaignRows.length > 0 && (
        <Card title="Campaign performance" className="mt-4">
          <Table>
            <Thead>
              <Th>Campaign</Th>
              <Th>Shortlisted</Th>
              <Th>Qualified</Th>
              <Th>Matched</Th>
              <Th>Drafts</Th>
              <Th>Sends</Th>
              <Th>Replies</Th>
            </Thead>
            <tbody>
              {campaignRows.map(({ campaign, analytics }) => (
                <Tr key={campaign.id}>
                  <Td>
                    <a href={`/campaigns/${campaign.id}`} className="font-medium text-primary-600 no-underline hover:underline">
                      {campaign.name}
                    </a>
                  </Td>
                  <Td>{analytics.shortlist.total}</Td>
                  <Td>
                    {analytics.qualification.passed}/{analytics.qualification.totalCurrentlyEvaluated}
                  </Td>
                  <Td>{analytics.matching.totalCurrentlyMatched}</Td>
                  <Td>{analytics.outreach.totalDrafts}</Td>
                  <Td>{analytics.sends.total}</Td>
                  <Td>{analytics.replies.total}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Outreach">
          <p className="mb-3 text-supporting text-ink-subtle">{s.outreach.totalDrafts} drafts generated.</p>
          <p className="mb-1.5 text-label uppercase tracking-wide text-ink-faint">By draft status</p>
          <div className="mb-3">
            <StatusBreakdown counts={s.outreach.byDraftStatus} />
          </div>
          <p className="mb-1.5 text-label uppercase tracking-wide text-ink-faint">By approval status</p>
          <StatusBreakdown counts={s.outreach.byApprovalStatus} />
        </Card>

        <Card title="Sends">
          <p className="mb-3 text-supporting text-ink-subtle">
            {s.sends.total} sends recorded (against the Mock outreach provider until a real one is selected).
          </p>
          <StatusBreakdown counts={s.sends.byStatus} />
        </Card>

        <Card title="Replies">
          <p className="mb-3 text-supporting text-ink-subtle">
            {s.replies.total} inbound replies, {s.replies.suggestedResponsesDrafted} with an AI-suggested response drafted.
          </p>
          <p className="mb-1.5 text-label uppercase tracking-wide text-ink-faint">By match status</p>
          <div className="mb-3">
            <StatusBreakdown counts={s.replies.byMatchStatus} />
          </div>
          <p className="mb-1.5 text-label uppercase tracking-wide text-ink-faint">By classification</p>
          <StatusBreakdown counts={s.replies.byClassification} />
        </Card>

        <Card title="Commercial">
          <p className="mb-1.5 text-label uppercase tracking-wide text-ink-faint">Affiliates ({s.whop.affiliates.total})</p>
          <div className="mb-3">
            <StatusBreakdown counts={s.whop.affiliates.byStatus} />
          </div>
          <p className="mb-1.5 text-label uppercase tracking-wide text-ink-faint">Conversions ({s.whop.conversions.total})</p>
          <div className="mb-3">
            <StatusBreakdown counts={s.whop.conversions.byEventType} />
          </div>
          {s.whop.conversions.revenueByCurrency.length > 0 && (
            <>
              <p className="mb-1.5 text-label uppercase tracking-wide text-ink-faint">Attributable revenue</p>
              <div className="flex flex-wrap gap-2">
                {s.whop.conversions.revenueByCurrency.map((r) => (
                  <div key={r.currency} className="rounded-control border border-success-200 bg-success-50 px-3 py-1.5 font-semibold text-success-700">
                    {r.total.toFixed(2)} {r.currency}
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Discovery">
          <p className="mb-3 text-supporting text-ink-subtle">{s.discovery.totalCreators} creators total.</p>
          <p className="mb-1.5 text-label uppercase tracking-wide text-ink-faint">By provenance</p>
          <div className="mb-3">
            <StatusBreakdown counts={s.discovery.byProvenance} />
          </div>
          <p className="mb-1.5 text-label uppercase tracking-wide text-ink-faint">By source</p>
          <StatusBreakdown counts={s.discovery.bySource} />
        </Card>

        <Card title="Creator CRM">
          <p className="mb-3 text-supporting text-ink-subtle">
            {s.crm.openTasks} open task{s.crm.openTasks === 1 ? "" : "s"} of {s.crm.totalTasks} total, {s.crm.totalNotes} note
            {s.crm.totalNotes === 1 ? "" : "s"}.
          </p>
          <p className="mb-1.5 text-label uppercase tracking-wide text-ink-faint">By relationship status</p>
          <StatusBreakdown counts={s.crm.byRelationshipStatus} />
        </Card>
      </div>
    </div>
  );
}
