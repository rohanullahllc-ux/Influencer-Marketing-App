import { listMembers } from "@rdv/auth";
import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../../../lib/session";
import { IssueSetupTokenButton } from "./IssueSetupTokenButton";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { ButtonLink } from "../../../../components/ui/Button";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { Table, Thead, Th, Tr, Td } from "../../../../components/ui/Table";

/**
 * Wave 2 Phase 0 (plan §5): Owner/Admin view of workspace members, with a
 * per-member action to issue a one-time setup link for anyone who hasn't
 * completed account setup yet (`hasPassword: false`).
 */
export default async function MembersPage() {
  let actor;
  try {
    actor = await requireSession();
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return (
        <EmptyState
          title="Sign in required"
          description="You must sign in to view workspace members."
          action={<ButtonLink href="/login" variant="primary">Sign in</ButtonLink>}
        />
      );
    }
    throw err;
  }

  const members = await listMembers(actor.workspaceId);
  const canManage = actor.role === "owner" || actor.role === "admin";

  return (
    <div>
      <PageHeader
        title="Workspace members"
        description={!canManage ? "Only an Owner/Admin can issue setup links." : undefined}
      />

      <Table>
        <Thead>
          <Th>Email</Th>
          <Th>Name</Th>
          <Th>Role</Th>
          <Th>Account status</Th>
          {canManage && <Th>&nbsp;</Th>}
        </Thead>
        <tbody>
          {members.map((m) => (
            <Tr key={m.userId}>
              <Td className="font-medium text-ink">{m.email}</Td>
              <Td className="text-ink-subtle">{m.name ?? "—"}</Td>
              <Td className="text-ink-subtle">{m.role}</Td>
              <Td>
                <StatusBadge label={m.hasPassword ? "Active" : "Setup required"} tone={m.hasPassword ? "success" : "warning"} />
              </Td>
              {canManage && (
                <Td>{!m.hasPassword && <IssueSetupTokenButton userId={m.userId} email={m.email} />}</Td>
              )}
            </Tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
