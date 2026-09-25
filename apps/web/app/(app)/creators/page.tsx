import { listCreators } from "@rdv/domain";
import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../../lib/session";
import { ManualCreatorForm } from "./ManualCreatorForm";
import { PageHeader } from "../../../components/ui/PageHeader";
import { ButtonLink } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { StatusBadge, toneForStatus } from "../../../components/ui/StatusBadge";
import { Table, Thead, Th, Tr, Td } from "../../../components/ui/Table";
import { Card } from "../../../components/ui/Card";

export default async function CreatorsPage() {
  let actor;
  try {
    actor = await requireSession();
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return (
        <EmptyState
          title="Sign in required"
          description="You must sign in to view creators."
          action={<ButtonLink href="/login" variant="primary">Sign in</ButtonLink>}
        />
      );
    }
    throw err;
  }

  const creators = await listCreators({ workspaceId: actor.workspaceId, actorUserId: actor.userId });

  return (
    <div>
      <PageHeader title="Creators" description="Every discovered or manually-added creator in this workspace." />

      {creators.length === 0 ? (
        <EmptyState
          title="No creators yet"
          description="Run discovery from a product page, or add one manually below."
        />
      ) : (
        <div className="mb-6">
          <Table>
            <Thead>
              <Th>Name</Th>
              <Th>Platform</Th>
              <Th>Provenance</Th>
              <Th>Subscribers</Th>
              <Th>Country</Th>
              <Th>Status</Th>
            </Thead>
            <tbody>
              {creators.map((c) => (
                <Tr key={c.id}>
                  <Td>
                    <a href={`/creators/${c.id}`} className="font-medium text-primary-600 no-underline hover:text-primary-700 hover:underline">
                      {c.displayName ?? c.channelUrl ?? c.id}
                    </a>
                  </Td>
                  <Td className="capitalize">{c.platform}</Td>
                  <Td>
                    <StatusBadge label={c.provenance} tone="neutral" />
                  </Td>
                  <Td>{c.subscriberCount?.toLocaleString() ?? "—"}</Td>
                  <Td>{c.country ?? "—"}</Td>
                  <Td>
                    <StatusBadge label={c.status} tone={toneForStatus(c.status)} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <Card title="Add a creator manually" className="max-w-xl">
        <ManualCreatorForm />
      </Card>
    </div>
  );
}
