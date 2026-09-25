import { listCampaigns } from "@rdv/domain";
import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../../lib/session";
import { PageHeader } from "../../../components/ui/PageHeader";
import { ButtonLink } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { StatusBadge, toneForStatus } from "../../../components/ui/StatusBadge";
import { Table, Thead, Th, Tr, Td } from "../../../components/ui/Table";

export default async function CampaignsPage() {
  let actor;
  try {
    actor = await requireSession();
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return (
        <EmptyState
          title="Sign in required"
          description="You must sign in to view campaigns."
          action={<ButtonLink href="/login" variant="primary">Sign in</ButtonLink>}
        />
      );
    }
    throw err;
  }

  const campaigns = await listCampaigns({ workspaceId: actor.workspaceId, actorUserId: actor.userId });

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="Set up a campaign, shortlist creators, and run outreach end-to-end."
        actions={
          <>
            <ButtonLink href="/templates" variant="secondary">Manage templates</ButtonLink>
            <ButtonLink href="/campaigns/new" variant="primary">+ New campaign</ButtonLink>
          </>
        }
      />

      {campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          description="Create your first campaign to start reaching out to creators."
          action={<ButtonLink href="/campaigns/new" variant="primary">+ New campaign</ButtonLink>}
        />
      ) : (
        <Table>
          <Thead>
            <Th>Name</Th>
            <Th>Status</Th>
            <Th>Created</Th>
          </Thead>
          <tbody>
            {campaigns.map((c) => (
              <Tr key={c.id}>
                <Td>
                  <a href={`/campaigns/${c.id}`} className="font-medium text-primary-600 no-underline hover:text-primary-700 hover:underline">
                    {c.name}
                  </a>
                </Td>
                <Td>
                  <StatusBadge label={c.status} tone={toneForStatus(c.status)} />
                </Td>
                <Td className="text-ink-subtle">{new Date(c.createdAt).toLocaleString()}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
