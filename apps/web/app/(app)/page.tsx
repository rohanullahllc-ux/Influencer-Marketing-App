import { getWorkspaceAnalytics, listApprovalQueue, listInboundMessages } from "@rdv/domain";
import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../lib/session";
import { getSystemHealth } from "../../lib/health";
import { PageHeader } from "../../components/ui/PageHeader";
import { MetricCard } from "../../components/ui/MetricCard";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { StatusBadge, toneForStatus } from "../../components/ui/StatusBadge";
import { ButtonLink } from "../../components/ui/Button";

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export default async function DashboardPage() {
  let actor;
  try {
    actor = await requireSession();
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return (
        <EmptyState
          title="Sign in required"
          description="You must sign in to view the dashboard."
          action={<ButtonLink href="/login" variant="primary">Sign in</ButtonLink>}
        />
      );
    }
    throw err;
  }

  const [analytics, pendingApprovals, allReplies, health] = await Promise.all([
    getWorkspaceAnalytics({ workspaceId: actor.workspaceId, actorUserId: actor.userId }),
    listApprovalQueue({ workspaceId: actor.workspaceId, actorUserId: actor.userId, status: "pending" }),
    listInboundMessages({ workspaceId: actor.workspaceId, actorUserId: actor.userId }),
    getSystemHealth(),
  ]);

  const repliesNeedingAttention = allReplies
    .filter((m) => m.matchStatus !== "matched" || !m.classification)
    .slice(0, 5);

  const totalRevenue = analytics.whop.conversions.revenueByCurrency;
  const activeCampaigns = analytics.campaigns.byStatus.active ?? 0;

  const recentActivity = [
    ...pendingApprovals.slice(0, 5).map((a) => ({
      kind: "Approval pending" as const,
      label: a.exactSubject,
      at: a.createdAt as unknown as string,
      href: "/approvals",
    })),
    ...allReplies.slice(0, 5).map((r) => ({
      kind: "Reply received" as const,
      label: r.subject ?? r.fromIdentity,
      at: r.receivedAt as unknown as string,
      href: "/replies",
    })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 6);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`${actor.role === "owner" ? "Owner" : actor.role === "admin" ? "Admin" : "Operator"} view — everything happening in your influencer operation right now.`}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <MetricCard label="Products" value={analytics.products.total} href="/products" />
        <MetricCard label="Active Campaigns" value={activeCampaigns} href="/campaigns" />
        <MetricCard label="Creators" value={analytics.discovery.totalCreators} href="/creators" />
        <MetricCard label="Pending Approvals" value={pendingApprovals.length} href="/approvals" />
        <MetricCard label="Replies" value={analytics.replies.total} href="/replies" />
        <MetricCard label="Sends" value={analytics.sends.total} href="/analytics" />
        <MetricCard label="Conversions" value={analytics.whop.conversions.total} href="/analytics" />
        <MetricCard
          label="Revenue"
          value={
            totalRevenue.length === 0
              ? "$0"
              : totalRevenue.map((r) => `${r.total.toFixed(2)} ${r.currency}`).join(", ")
          }
          href="/analytics"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Campaign activity" className="lg:col-span-1">
          {Object.keys(analytics.campaigns.byStatus).length === 0 ? (
            <EmptyState title="No campaigns yet" description="Create a campaign to get started." />
          ) : (
            <div className="flex flex-col gap-2">
              {Object.entries(analytics.campaigns.byStatus).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <StatusBadge label={status} tone={toneForStatus(status)} />
                  <span className="text-body font-medium text-ink">{count}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3">
            <ButtonLink href="/campaigns" size="sm">
              View campaigns
            </ButtonLink>
          </div>
        </Card>

        <Card
          title="Needs your approval"
          actions={<ButtonLink href="/approvals" size="sm" variant="ghost">View all</ButtonLink>}
        >
          {pendingApprovals.length === 0 ? (
            <EmptyState title="Nothing pending" description="No outreach drafts are waiting for approval." />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {pendingApprovals.slice(0, 5).map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="truncate text-supporting font-medium text-ink">{a.exactSubject}</div>
                    <div className="text-meta text-ink-faint">{formatRelativeTime(a.createdAt as unknown as string)}</div>
                  </div>
                  <StatusBadge label="pending" tone="warning" />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Replies needing attention"
          actions={<ButtonLink href="/replies" size="sm" variant="ghost">View all</ButtonLink>}
        >
          {repliesNeedingAttention.length === 0 ? (
            <EmptyState title="All caught up" description="No unresolved replies right now." />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {repliesNeedingAttention.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="truncate text-supporting font-medium text-ink">{r.subject ?? r.fromIdentity}</div>
                    <div className="text-meta text-ink-faint">{formatRelativeTime(r.receivedAt as unknown as string)}</div>
                  </div>
                  <StatusBadge label={r.matchStatus} tone={toneForStatus(r.matchStatus)} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card
          title="Operational health"
          actions={<ButtonLink href="/ops" size="sm" variant="ghost">Open Operations</ButtonLink>}
        >
          <div className="flex items-center gap-2">
            <StatusBadge label={health.status === "ok" ? "Healthy" : "Degraded"} tone={health.status === "ok" ? "success" : "danger"} />
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            {Object.entries(health.checks).map(([name, check]) => (
              <div key={name} className="flex items-center justify-between text-supporting">
                <span className="capitalize text-ink-muted">{name}</span>
                <StatusBadge label={check.ok ? "OK" : "Failing"} tone={check.ok ? "success" : "danger"} dot={false} />
              </div>
            ))}
          </div>
        </Card>

        <Card title="Recent activity" className="lg:col-span-2">
          {recentActivity.length === 0 ? (
            <EmptyState title="No recent activity" description="Activity will appear here as outreach and replies happen." />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {recentActivity.map((item, i) => (
                <li key={i} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-meta font-medium uppercase tracking-wide text-ink-faint">
                      {item.kind}
                    </span>
                    <span className="truncate text-supporting text-ink">{item.label}</span>
                  </div>
                  <a href={item.href} className="shrink-0 text-meta text-ink-faint no-underline hover:text-primary-600 hover:underline">
                    {formatRelativeTime(item.at)}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
