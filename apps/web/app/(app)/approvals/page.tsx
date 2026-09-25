import { listApprovalQueue, listCampaigns, listCreators, type ApprovalStatus } from "@rdv/domain";
import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../../lib/session";
import { ApprovalRow } from "./ApprovalRow";
import { PageHeader } from "../../../components/ui/PageHeader";
import { ButtonLink } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Alert } from "../../../components/ui/Alert";

const STATUSES: ApprovalStatus[] = ["pending", "approved", "rejected", "returned_for_edit", "invalidated"];

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

export default async function ApprovalsPage({ searchParams }: { searchParams: { status?: string } }) {
  let actor;
  try {
    actor = await requireSession();
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return (
        <EmptyState
          title="Sign in required"
          description="You must sign in to view approvals."
          action={<ButtonLink href="/login" variant="primary">Sign in</ButtonLink>}
        />
      );
    }
    throw err;
  }

  const statusFilter = STATUSES.includes(searchParams.status as ApprovalStatus) ? (searchParams.status as ApprovalStatus) : undefined;
  const [approvals, campaigns, creators] = await Promise.all([
    listApprovalQueue({ workspaceId: actor.workspaceId, actorUserId: actor.userId, status: statusFilter }),
    listCampaigns({ workspaceId: actor.workspaceId, actorUserId: actor.userId }),
    listCreators({ workspaceId: actor.workspaceId, actorUserId: actor.userId }),
  ]);
  const canDecide = actor.role === "owner" || actor.role === "admin";
  const campaignNameById = new Map(campaigns.map((c) => [c.id, c.name]));
  const creatorNameById = new Map(creators.map((c) => [c.id, c.displayName ?? c.channelUrl ?? c.id]));

  return (
    <div>
      <PageHeader
        title="Approvals"
        description="The single founder-facing queue across all campaigns — exact message content, reviewed and approved before anything sends."
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <FilterPill href="/approvals" label="All" active={!statusFilter} />
        {STATUSES.map((s) => (
          <FilterPill key={s} href={`/approvals?status=${s}`} label={s.replace(/_/g, " ")} active={statusFilter === s} />
        ))}
      </div>

      {!canDecide && (
        <div className="mb-5">
          <Alert tone="neutral">Only an Owner/Admin can approve, reject, or request edits. You can still view every message here.</Alert>
        </div>
      )}

      {approvals.length === 0 ? (
        <EmptyState title="Nothing here" description={`No approvals${statusFilter ? ` with status "${statusFilter.replace(/_/g, " ")}"` : ""} yet.`} />
      ) : (
        <div className="flex flex-col gap-4">
          {approvals.map((a) => (
            <ApprovalRow
              key={a.id}
              approval={a}
              canDecide={canDecide}
              campaignName={campaignNameById.get(a.campaignId) ?? a.campaignId}
              creatorName={creatorNameById.get(a.creatorId) ?? a.creatorId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
