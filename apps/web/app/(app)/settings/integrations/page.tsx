import { getCredentialStatus, isAiMockModeEnabled } from "@rdv/auth";
import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../../../lib/session";
import { AddCredentialForm } from "./AddCredentialForm";
import { MockAiModeToggle } from "./MockAiModeToggle";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { ButtonLink } from "../../../../components/ui/Button";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { Card } from "../../../../components/ui/Card";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { Table, Thead, Th, Tr, Td } from "../../../../components/ui/Table";

/**
 * Wave 2 Phase 0 (plan §4B, §5): Owner/Admin screen to store the YouTube
 * and Anthropic API keys Phase 3/5/6 will need. The key itself is never
 * rendered back — only provider/status/rotatedAt, exactly what
 * `getCredentialStatus` returns.
 */
export default async function IntegrationsPage() {
  let actor;
  try {
    actor = await requireSession();
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return (
        <EmptyState
          title="Sign in required"
          description="You must sign in to view Integrations."
          action={<ButtonLink href="/login" variant="primary">Sign in</ButtonLink>}
        />
      );
    }
    throw err;
  }

  if (actor.role !== "owner" && actor.role !== "admin") {
    return <EmptyState title="Restricted" description="Only an Owner/Admin can manage integration credentials." />;
  }

  const [statuses, mockModeEnabled] = await Promise.all([
    getCredentialStatus({ workspaceId: actor.workspaceId, actorUserId: actor.userId }),
    isAiMockModeEnabled(actor.workspaceId),
  ]);

  return (
    <div>
      <PageHeader
        title="Integrations"
        description="Keys are encrypted before storage (AES-256-GCM) and never displayed again after entry. YouTube discovery and AI-assisted steps cannot run for real until a working key is stored here."
      />

      <Card title="Mock AI mode" className="mb-4">
        <p className="mb-3 text-supporting text-ink-subtle">
          Exercise the full AI-assisted workflow — product intelligence, creator matching, outreach drafts, reply
          classification — without a real Anthropic key or any API cost. Every result is generated locally and
          clearly labeled <span className="font-medium text-ink">[MOCK]</span>, never mistaken for real AI output.
          This never affects real message sending, which stays behind its own separate approval and safety gate
          regardless of this setting.
        </p>
        <div className="mb-3 flex items-center gap-2">
          <StatusBadge label={mockModeEnabled ? "Mock AI mode is ON" : "Mock AI mode is off"} tone={mockModeEnabled ? "warning" : "neutral"} />
        </div>
        <MockAiModeToggle initialEnabled={mockModeEnabled} />
      </Card>

      <Card title="Current status" className="mb-4">
        <Table>
          <Thead>
            <Th>Provider</Th>
            <Th>Status</Th>
            <Th>Rotated at</Th>
          </Thead>
          <tbody>
            {["youtube", "anthropic"].map((provider) => {
              const active = statuses.find((s) => s.provider === provider && s.status === "active");
              return (
                <Tr key={provider}>
                  <Td className="font-medium text-ink">{provider}</Td>
                  <Td>
                    <StatusBadge label={active ? "Configured" : "Not configured"} tone={active ? "success" : "neutral"} />
                  </Td>
                  <Td className="text-ink-subtle">{active?.rotatedAt ? new Date(active.rotatedAt).toLocaleString() : "—"}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Card title="Add / rotate a key">
        <AddCredentialForm />
      </Card>
    </div>
  );
}
