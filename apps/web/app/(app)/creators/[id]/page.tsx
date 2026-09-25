import {
  getCreator,
  getCreatorRelationship,
  listCreatorNotes,
  listCreatorTasks,
  getCreatorHistory,
  listCreatorConversationSummaries,
  listCreatorAffiliatesForCreator,
} from "@rdv/domain";
import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../../../lib/session";
import { RelationshipPanel } from "./RelationshipPanel";
import { NotesPanel } from "./NotesPanel";
import { TasksPanel } from "./TasksPanel";
import { SummaryPanel } from "./SummaryPanel";
import { AffiliatePanel } from "./AffiliatePanel";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { ButtonLink } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { StatusBadge, toneForStatus } from "../../../../components/ui/StatusBadge";
import { Tabs } from "../../../../components/ui/Tabs";
import { Table, Thead, Th, Tr, Td } from "../../../../components/ui/Table";

export default async function CreatorDetailPage({ params }: { params: { id: string } }) {
  let actor;
  try {
    actor = await requireSession();
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return (
        <EmptyState
          title="Sign in required"
          description="You must sign in to view this creator."
          action={<ButtonLink href="/login" variant="primary">Sign in</ButtonLink>}
        />
      );
    }
    throw err;
  }

  const creatorId = params.id;
  const [creator, relationship, notes, tasks, history, summaries, affiliates] = await Promise.all([
    getCreator({ workspaceId: actor.workspaceId, actorUserId: actor.userId, creatorId }),
    getCreatorRelationship({ workspaceId: actor.workspaceId, actorUserId: actor.userId, creatorId }),
    listCreatorNotes({ workspaceId: actor.workspaceId, actorUserId: actor.userId, creatorId }),
    listCreatorTasks({ workspaceId: actor.workspaceId, actorUserId: actor.userId, creatorId }),
    getCreatorHistory({ workspaceId: actor.workspaceId, actorUserId: actor.userId, creatorId }),
    listCreatorConversationSummaries({ workspaceId: actor.workspaceId, actorUserId: actor.userId, creatorId }),
    listCreatorAffiliatesForCreator({ workspaceId: actor.workspaceId, actorUserId: actor.userId, creatorId }),
  ]);

  const historyCount = history.outreachSends.length + history.inboundMessages.length;
  const openTaskCount = tasks.filter((t) => t.status === "open").length;

  const historyRows = [
    ...history.outreachSends.map((s) => ({
      id: `send-${s.id}`,
      direction: "Outbound" as const,
      when: (s.sentAt ?? s.createdAt) as unknown as string,
      detail: `${s.status} (${s.outreachStep})`,
    })),
    ...history.inboundMessages.map((m) => ({
      id: `msg-${m.id}`,
      direction: "Inbound" as const,
      when: m.receivedAt as unknown as string,
      detail: `${m.subject ?? "(no subject)"} — ${m.classification ?? m.matchStatus}`,
    })),
  ].sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());

  return (
    <div>
      <PageHeader
        title={creator.displayName ?? creator.channelUrl ?? "Creator"}
        description={`${creator.platform} · ${creator.provenance} · ${creator.contactEmail ?? "no contact email on file"}`}
        breadcrumbs={[{ label: "Creators", href: "/creators" }, { label: creator.displayName ?? "Creator" }]}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge label={relationship.status.replace(/_/g, " ")} tone={toneForStatus(relationship.status)} />
            <StatusBadge label={creator.status} tone={toneForStatus(creator.status)} />
          </div>
        }
      />

      <Tabs
        tabs={[
          {
            id: "overview",
            label: "Overview",
            content: (
              <Card title="Overview">
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <dt className="text-label uppercase tracking-wide text-ink-faint">Subscribers</dt>
                    <dd className="mt-1 text-body text-ink">{creator.subscriberCount?.toLocaleString() ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-label uppercase tracking-wide text-ink-faint">Avg. views</dt>
                    <dd className="mt-1 text-body text-ink">{creator.avgViews?.toLocaleString() ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-label uppercase tracking-wide text-ink-faint">Engagement</dt>
                    <dd className="mt-1 text-body text-ink">{creator.engagementRate ? `${creator.engagementRate}%` : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-label uppercase tracking-wide text-ink-faint">Country</dt>
                    <dd className="mt-1 text-body text-ink">{creator.country ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-label uppercase tracking-wide text-ink-faint">Niche</dt>
                    <dd className="mt-1 text-body text-ink">{creator.niche ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-label uppercase tracking-wide text-ink-faint">Creator type</dt>
                    <dd className="mt-1 text-body text-ink">{creator.creatorType ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-label uppercase tracking-wide text-ink-faint">Language</dt>
                    <dd className="mt-1 text-body text-ink">{creator.language ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-label uppercase tracking-wide text-ink-faint">Discovered</dt>
                    <dd className="mt-1 text-body text-ink">{new Date(creator.discoveredAt).toLocaleDateString()}</dd>
                  </div>
                </dl>
                {creator.channelUrl && (
                  <p className="mt-4 text-supporting">
                    <a href={creator.channelUrl} className="text-primary-600 no-underline hover:underline">
                      {creator.channelUrl}
                    </a>
                  </p>
                )}
              </Card>
            ),
          },
          {
            id: "relationship",
            label: "Relationship",
            content: (
              <Card title="Relationship">
                <RelationshipPanel creatorId={creatorId} relationship={relationship} />
              </Card>
            ),
          },
          {
            id: "conversation",
            label: "Conversation",
            badge: historyCount,
            content: (
              <div className="flex flex-col gap-4">
                <Card title="AI conversation summary">
                  <p className="mb-3 text-supporting text-ink-subtle">
                    Summarizes the real outreach/reply history below — never invents facts, always grounded in the actual thread. Read-only:
                    never changes anything.
                  </p>
                  <SummaryPanel creatorId={creatorId} initialSummaries={summaries} hasHistory={historyCount > 0} />
                </Card>
                <Card title="Outreach + reply history">
                  <p className="mb-3 text-supporting text-ink-subtle">Real data from the actual send/reply pipeline — nothing duplicated here.</p>
                  {historyRows.length === 0 ? (
                    <EmptyState title="No history yet" description="No outreach or replies yet for this creator." />
                  ) : (
                    <Table>
                      <Thead>
                        <Th>Direction</Th>
                        <Th>When</Th>
                        <Th>Status / Subject</Th>
                      </Thead>
                      <tbody>
                        {historyRows.map((r) => (
                          <Tr key={r.id}>
                            <Td>
                              <StatusBadge
                                label={r.direction}
                                tone={r.direction === "Outbound" ? "primary" : "neutral"}
                                dot={false}
                              />
                            </Td>
                            <Td className="text-ink-subtle">{new Date(r.when).toLocaleString()}</Td>
                            <Td>{r.detail}</Td>
                          </Tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                </Card>
              </div>
            ),
          },
          {
            id: "crm",
            label: "CRM",
            badge: openTaskCount,
            content: (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card title="Notes">
                  <NotesPanel creatorId={creatorId} initialNotes={notes} />
                </Card>
                <Card title="Tasks">
                  <TasksPanel creatorId={creatorId} initialTasks={tasks} />
                </Card>
              </div>
            ),
          },
          {
            id: "commercial",
            label: "Commercial",
            content: (
              <Card title="Whop affiliate">
                <p className="mb-3 text-supporting text-ink-subtle">
                  Human-triggered only — nothing here happens automatically. No real Whop credentials are configured in this environment;
                  creation runs against a real, deterministic Mock provider so the full flow is testable now.
                </p>
                <AffiliatePanel creatorId={creatorId} initialAffiliates={affiliates} />
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}
