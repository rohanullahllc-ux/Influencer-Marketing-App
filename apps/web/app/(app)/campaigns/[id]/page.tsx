import {
  getCampaign,
  getProduct,
  listCampaignCreators,
  listCampaignTemplates,
  listCreators,
  listTemplates,
  listCurrentQualifications,
  listCurrentMatches,
  getCampaignAnalytics,
} from "@rdv/domain";
import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../../../lib/session";
import { ShortlistPanel } from "./ShortlistPanel";
import { TemplateAssignmentPanel } from "./TemplateAssignmentPanel";
import { QualificationMatchingPanel } from "./QualificationMatchingPanel";
import { OutreachDraftPanel } from "./OutreachDraftPanel";
import { DryRunPanel } from "./DryRunPanel";
import { SendsPanel } from "./SendsPanel";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { ButtonLink } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { StatusBadge, toneForStatus } from "../../../../components/ui/StatusBadge";
import { Tabs } from "../../../../components/ui/Tabs";
import { MetricCard } from "../../../../components/ui/MetricCard";

export default async function CampaignDetailPage({ params }: { params: { id: string } }) {
  let actor;
  try {
    actor = await requireSession();
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return (
        <EmptyState
          title="Sign in required"
          description="You must sign in to view this campaign."
          action={<ButtonLink href="/login" variant="primary">Sign in</ButtonLink>}
        />
      );
    }
    throw err;
  }

  const campaign = await getCampaign({ workspaceId: actor.workspaceId, actorUserId: actor.userId, campaignId: params.id });
  const [product, shortlisted, allCreators, assignments, allTemplates, qualifications, matches, analytics] = await Promise.all([
    getProduct({ workspaceId: actor.workspaceId, actorUserId: actor.userId, productId: campaign.productId }),
    listCampaignCreators({ workspaceId: actor.workspaceId, actorUserId: actor.userId, campaignId: params.id }),
    listCreators({ workspaceId: actor.workspaceId, actorUserId: actor.userId }),
    listCampaignTemplates({ workspaceId: actor.workspaceId, actorUserId: actor.userId, campaignId: params.id }),
    listTemplates({ workspaceId: actor.workspaceId, actorUserId: actor.userId }),
    listCurrentQualifications({ workspaceId: actor.workspaceId, actorUserId: actor.userId, campaignId: params.id }),
    listCurrentMatches({ workspaceId: actor.workspaceId, actorUserId: actor.userId, campaignId: params.id }),
    getCampaignAnalytics({ workspaceId: actor.workspaceId, actorUserId: actor.userId, campaignId: params.id }),
  ]);
  const shortlistedCreators = allCreators.filter((c) => shortlisted.some((s) => s.creatorId === c.id));

  const targetGeography = (campaign.targetGeography as string[] | null) ?? [];
  const targetLanguages = (campaign.targetLanguages as string[] | null) ?? [];
  const creatorTypes = (campaign.creatorTypes as string[] | null) ?? [];
  const nicheRequirements = (campaign.nicheRequirements as string[] | null) ?? [];

  return (
    <div>
      <PageHeader
        title={campaign.name}
        description={campaign.objective ?? undefined}
        breadcrumbs={[{ label: "Campaigns", href: "/campaigns" }, { label: campaign.name }]}
        actions={<StatusBadge label={campaign.status} tone={toneForStatus(campaign.status)} />}
      />

      <Tabs
        tabs={[
          {
            id: "overview",
            label: "Overview",
            content: (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <MetricCard label="Shortlisted" value={analytics.shortlist.total} />
                  <MetricCard
                    label="Qualified"
                    value={`${analytics.qualification.passed}/${analytics.qualification.totalCurrentlyEvaluated}`}
                  />
                  <MetricCard label="Matched" value={analytics.matching.totalCurrentlyMatched} />
                  <MetricCard label="Sends" value={analytics.sends.total} />
                </div>
                <Card title="Campaign details">
                  <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <dt className="text-label uppercase tracking-wide text-ink-faint">Product</dt>
                      <dd className="mt-1 text-body text-ink">
                        <a href={`/products/${product.id}`} className="text-primary-600 no-underline hover:underline">
                          {product.name}
                        </a>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-label uppercase tracking-wide text-ink-faint">Dates</dt>
                      <dd className="mt-1 text-body text-ink">
                        {campaign.startDate ?? "—"} → {campaign.endDate ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-label uppercase tracking-wide text-ink-faint">Target geography</dt>
                      <dd className="mt-1 text-body text-ink">{targetGeography.join(", ") || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-label uppercase tracking-wide text-ink-faint">Target languages</dt>
                      <dd className="mt-1 text-body text-ink">{targetLanguages.join(", ") || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-label uppercase tracking-wide text-ink-faint">Creator types</dt>
                      <dd className="mt-1 text-body text-ink">{creatorTypes.join(", ") || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-label uppercase tracking-wide text-ink-faint">Niche requirements</dt>
                      <dd className="mt-1 text-body text-ink">{nicheRequirements.join(", ") || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-label uppercase tracking-wide text-ink-faint">First-send cap</dt>
                      <dd className="mt-1 text-body text-ink">{campaign.firstSendCap ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-label uppercase tracking-wide text-ink-faint">Sending limits</dt>
                      <dd className="mt-1 text-body text-ink">
                        {campaign.sendingLimits ? JSON.stringify(campaign.sendingLimits) : "—"}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-label uppercase tracking-wide text-ink-faint">Qualification thresholds</dt>
                      <dd className="mt-1 text-body text-ink">
                        {campaign.qualificationThresholds ? JSON.stringify(campaign.qualificationThresholds) : "—"}
                      </dd>
                    </div>
                  </dl>
                </Card>
              </div>
            ),
          },
          {
            id: "creators",
            label: "Creators",
            badge: shortlisted.length,
            content: (
              <div className="flex flex-col gap-4">
                <Card title="Shortlist">
                  <ShortlistPanel campaignId={campaign.id} allCreators={allCreators} shortlisted={shortlisted} />
                </Card>
                <Card title="Template assignment">
                  <TemplateAssignmentPanel campaignId={campaign.id} allTemplates={allTemplates} assignments={assignments} />
                </Card>
              </div>
            ),
          },
          {
            id: "qualification",
            label: "Qualification & Matching",
            content: (
              <Card title="Qualification & Matching">
                <QualificationMatchingPanel
                  campaignId={campaign.id}
                  shortlistedCreators={shortlistedCreators}
                  initialQualifications={qualifications}
                  initialMatches={matches}
                />
              </Card>
            ),
          },
          {
            id: "outreach",
            label: "Outreach",
            badge: analytics.outreach.totalDrafts,
            content: (
              <Card title="Outreach drafts">
                <OutreachDraftPanel campaignId={campaign.id} shortlistedCreators={shortlistedCreators} />
              </Card>
            ),
          },
          {
            id: "approvals",
            label: "Approvals",
            content: (
              <Card title="Approvals">
                <p className="mb-4 text-supporting text-ink-subtle">
                  Approvals for this campaign's outreach drafts are reviewed in the central founder-facing queue, where the exact message
                  content is shown before any send is scheduled.
                </p>
                <ButtonLink href="/approvals" variant="primary">
                  Open Approval Queue
                </ButtonLink>
              </Card>
            ),
          },
          {
            id: "sends",
            label: "Sends",
            badge: analytics.sends.total,
            content: (
              <div className="flex flex-col gap-4">
                <Card title="Safety gate / dry run" className="border-primary-200">
                  <p className="mb-3 text-supporting text-ink-subtle">
                    Shows eligible vs. blocked messages with exact reasons. No real email is ever sent from this screen or anywhere in this
                    codebase.
                  </p>
                  <DryRunPanel campaignId={campaign.id} shortlistedCreators={shortlistedCreators} />
                </Card>
                <Card title="Send history">
                  <p className="mb-3 text-supporting text-ink-subtle">
                    Real send history. Schedule a send from an approved message on{" "}
                    <a href="/approvals" className="text-primary-600 no-underline hover:underline">
                      /approvals
                    </a>
                    .
                  </p>
                  <SendsPanel campaignId={campaign.id} shortlistedCreators={shortlistedCreators} />
                </Card>
              </div>
            ),
          },
          {
            id: "analytics",
            label: "Analytics",
            content: (
              <Card title="Campaign analytics">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <MetricCard label="Shortlisted" value={analytics.shortlist.total} />
                  <MetricCard
                    label="Qualified"
                    value={`${analytics.qualification.passed}/${analytics.qualification.totalCurrentlyEvaluated}`}
                  />
                  <MetricCard
                    label="Matched"
                    value={analytics.matching.totalCurrentlyMatched}
                    hint={analytics.matching.averageScore !== null ? `avg score ${analytics.matching.averageScore.toFixed(2)}` : undefined}
                  />
                  <MetricCard label="Drafts" value={analytics.outreach.totalDrafts} />
                  <MetricCard label="Sends" value={analytics.sends.total} />
                  <MetricCard label="Replies" value={analytics.replies.total} />
                </div>
                <p className="mt-4 text-supporting text-ink-subtle">
                  See <a href="/analytics" className="text-primary-600 no-underline hover:underline">/analytics</a> for the full workspace
                  rollup.
                </p>
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}
