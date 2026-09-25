import { listTemplates } from "@rdv/domain";
import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../../lib/session";
import { PageHeader } from "../../../components/ui/PageHeader";
import { ButtonLink } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { StatusBadge, toneForStatus } from "../../../components/ui/StatusBadge";
import { Table, Thead, Th, Tr, Td } from "../../../components/ui/Table";

/** Wave 2 Phase 4 (plan §9): outreach template list. */
export default async function TemplatesPage() {
  let actor;
  try {
    actor = await requireSession();
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return (
        <EmptyState
          title="Sign in required"
          description="You must sign in to view templates."
          action={<ButtonLink href="/login" variant="primary">Sign in</ButtonLink>}
        />
      );
    }
    throw err;
  }

  const templates = await listTemplates({ workspaceId: actor.workspaceId, actorUserId: actor.userId });

  return (
    <div>
      <PageHeader
        title="Templates"
        description="Reusable outreach message templates, assigned to campaigns by creator segment."
        actions={<ButtonLink href="/templates/new" variant="primary">+ New template</ButtonLink>}
      />

      {templates.length === 0 ? (
        <EmptyState
          title="No templates yet"
          description="Create a template to reuse across campaign outreach."
          action={<ButtonLink href="/templates/new" variant="primary">+ New template</ButtonLink>}
        />
      ) : (
        <Table>
          <Thead>
            <Th>Name</Th>
            <Th>Subject</Th>
            <Th>Status</Th>
          </Thead>
          <tbody>
            {templates.map((t) => (
              <Tr key={t.id}>
                <Td>
                  <a href={`/templates/${t.id}`} className="font-medium text-primary-600 no-underline hover:underline">
                    {t.name}
                  </a>
                </Td>
                <Td className="max-w-md whitespace-normal text-ink-subtle">{t.subject ?? "—"}</Td>
                <Td>
                  <StatusBadge label={t.status} tone={toneForStatus(t.status)} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
