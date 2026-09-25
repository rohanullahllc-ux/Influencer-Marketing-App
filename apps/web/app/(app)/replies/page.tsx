import { listInboundMessages, listCampaigns, listCreators } from "@rdv/domain";
import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../../lib/session";
import { ReplyRow } from "./ReplyRow";
import { PageHeader } from "../../../components/ui/PageHeader";
import { ButtonLink } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";

const MATCH_STATUSES = ["matched", "ambiguous", "unknown"] as const;

function FilterPill({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <a
      href={href}
      className={`rounded-pill px-3 py-1.5 text-supporting font-medium no-underline transition ${
        active ? "bg-primary-600 text-white" : "bg-surface-muted text-ink-muted hover:bg-neutral-200"
      }`}
    >
      {label}
    </a>
  );
}

export default async function RepliesPage({ searchParams }: { searchParams: { matchStatus?: string } }) {
  let actor;
  try {
    actor = await requireSession();
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return (
        <EmptyState
          title="Sign in required"
          description="You must sign in to view replies."
          action={<ButtonLink href="/login" variant="primary">Sign in</ButtonLink>}
        />
      );
    }
    throw err;
  }

  const matchStatusFilter = MATCH_STATUSES.includes(searchParams.matchStatus as (typeof MATCH_STATUSES)[number])
    ? (searchParams.matchStatus as (typeof MATCH_STATUSES)[number])
    : undefined;

  const [messages, campaigns, creators] = await Promise.all([
    listInboundMessages({ workspaceId: actor.workspaceId, actorUserId: actor.userId, matchStatus: matchStatusFilter }),
    listCampaigns({ workspaceId: actor.workspaceId, actorUserId: actor.userId }),
    listCreators({ workspaceId: actor.workspaceId, actorUserId: actor.userId }),
  ]);
  const campaignNameById = new Map(campaigns.map((c) => [c.id, c.name]));
  const creatorNameById = new Map(creators.map((c) => [c.id, c.displayName ?? c.channelUrl ?? c.id]));

  return (
    <div>
      <PageHeader
        title="Replies"
        description="Every inbound reply, matched to a creator/campaign where possible. AI classifies and may suggest a response — it never sends anything. A suggested response becomes a normal draft on /approvals that still needs human approval."
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <FilterPill href="/replies" label="All" active={!matchStatusFilter} />
        {MATCH_STATUSES.map((s) => (
          <FilterPill key={s} href={`/replies?matchStatus=${s}`} label={s} active={matchStatusFilter === s} />
        ))}
      </div>

      {messages.length === 0 ? (
        <EmptyState title="No replies yet" description="Inbound replies will appear here as they arrive." />
      ) : (
        <div className="flex flex-col gap-4">
          {messages.map((m) => (
            <ReplyRow
              key={m.id}
              message={m}
              campaignName={m.campaignId ? campaignNameById.get(m.campaignId) ?? m.campaignId : undefined}
              creatorName={m.creatorId ? creatorNameById.get(m.creatorId) ?? m.creatorId : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
