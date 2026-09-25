import { listSuppressions } from "@rdv/domain";
import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../../lib/session";
import { AddSuppressionForm } from "./AddSuppressionForm";
import { PageHeader } from "../../../components/ui/PageHeader";
import { ButtonLink } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Card } from "../../../components/ui/Card";
import { Table, Thead, Th, Tr, Td } from "../../../components/ui/Table";

/** Wave 2 Phase 7 (plan §12): the workspace's durable suppression/DNC list. */
export default async function SuppressionsPage() {
  let actor;
  try {
    actor = await requireSession();
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return (
        <EmptyState
          title="Sign in required"
          description="You must sign in to view suppressions."
          action={<ButtonLink href="/login" variant="primary">Sign in</ButtonLink>}
        />
      );
    }
    throw err;
  }

  const suppressions = await listSuppressions({ workspaceId: actor.workspaceId, actorUserId: actor.userId });

  return (
    <div>
      <PageHeader
        title="Suppressions"
        description="Durable, workspace-scoped do-not-contact list. A suppressed identity always blocks outreach in the dry-run safety gate, regardless of approval status. Entries cannot be removed from this screen."
      />

      <Card title="Add a suppression" className="mb-4">
        <AddSuppressionForm />
      </Card>

      {suppressions.length === 0 ? (
        <EmptyState title="No suppressions yet" description="Contacts added to the do-not-contact list will appear here." />
      ) : (
        <Table>
          <Thead>
            <Th>Identity</Th>
            <Th>Reason</Th>
            <Th>Added</Th>
          </Thead>
          <tbody>
            {suppressions.map((s) => (
              <Tr key={s.id}>
                <Td className="font-medium text-ink">{s.normalizedIdentity}</Td>
                <Td className="max-w-md whitespace-normal text-ink-subtle">{s.reason ?? "—"}</Td>
                <Td className="text-ink-subtle">{new Date(s.createdAt).toLocaleString()}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
