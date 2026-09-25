import { getSystemHealth } from "../../../lib/health";
import { getOpsQueueDetail } from "../../../lib/opsQueueDetail";
import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../../lib/session";
import { RetryJobButton } from "./RetryJobButton";
import { PageHeader } from "../../../components/ui/PageHeader";
import { ButtonLink } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Card } from "../../../components/ui/Card";
import { Alert } from "../../../components/ui/Alert";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { Table, Thead, Th, Tr, Td } from "../../../components/ui/Table";

/**
 * Operations surface. Wave 1 proved the surface exists and reads real
 * infrastructure state (DB/Redis health, combined queue depth). Wave 6
 * (Job Reliability hardening) fills in the content that comment always
 * said would arrive here: per-lane state breakdown, real failed jobs with
 * their actual failure reason (never fabricated), a "possibly stuck"
 * active-job flag, and a real retry action — reading exactly the data
 * `removeOnFail: false` (packages/queue/src/queues.ts) was configured to
 * keep available for this page.
 *
 * Gated behind an authenticated Owner/Admin session (Wave 6 finding: this
 * page previously had no auth check at all, and shows real job payloads —
 * workspace/creator/email data — which must never be exposed without
 * authentication). `/api/health` remains deliberately unauthenticated for
 * deployment/orchestration tooling; this human-facing dashboard is a
 * different, more sensitive surface.
 */
export default async function OpsPage() {
  let actor;
  try {
    actor = await requireSession();
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return (
        <EmptyState
          title="Sign in required"
          description="You must sign in to view Operations."
          action={<ButtonLink href="/login" variant="primary">Sign in</ButtonLink>}
        />
      );
    }
    throw err;
  }

  if (actor.role !== "owner" && actor.role !== "admin") {
    return <EmptyState title="Restricted" description="Only an Owner or Admin may view Operations." />;
  }

  const health = await getSystemHealth();
  const detail = await getOpsQueueDetail();

  return (
    <div>
      <PageHeader title="Operations" description="Live infrastructure health, queue state, and job reliability — read directly from Postgres/Redis, nothing cached or simulated." />

      <Alert tone={health.status === "ok" ? "success" : "danger"} title={`Overall status: ${health.status.toUpperCase()}`}>
        Checked at {new Date(health.timestamp).toLocaleString()}
      </Alert>

      <Card title="Dependency checks" className="mt-4">
        <Table>
          <Thead>
            <Th>Dependency</Th>
            <Th>Status</Th>
            <Th>Error</Th>
          </Thead>
          <tbody>
            {Object.entries(health.checks).map(([name, check]) => (
              <Tr key={name}>
                <Td className="font-medium text-ink">{name}</Td>
                <Td>
                  <StatusBadge label={check.ok ? "OK" : "FAIL"} tone={check.ok ? "success" : "danger"} />
                </Td>
                <Td className="max-w-md whitespace-normal text-ink-subtle">{check.error ?? "—"}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card title="Queue lanes — real per-state counts" className="mt-4">
        <Table>
          <Thead>
            <Th>Lane</Th>
            <Th>Waiting</Th>
            <Th>Active</Th>
            <Th>Delayed</Th>
            <Th>Failed</Th>
            <Th>Completed (last 7d)</Th>
          </Thead>
          <tbody>
            {Object.entries(detail.countsByLane).map(([lane, counts]) => (
              <Tr key={lane}>
                <Td className="font-medium text-ink">{lane}</Td>
                <Td>{counts.waiting}</Td>
                <Td>{counts.active}</Td>
                <Td>{counts.delayed}</Td>
                <Td>
                  {counts.failed > 0 ? (
                    <StatusBadge label={String(counts.failed)} tone="danger" />
                  ) : (
                    <span className="text-ink-faint">0</span>
                  )}
                </Td>
                <Td>{counts.completed}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card title="Possibly stuck jobs" className="mt-4">
        <p className="mb-3 text-supporting text-ink-subtle">
          An active job processing longer than 2 minutes against local Mock providers — worth a human look, nothing here
          cancels or kills a job automatically.
        </p>
        {detail.stuckJobs.length === 0 ? (
          <p className="text-supporting text-ink-faint">None.</p>
        ) : (
          <Table>
            <Thead>
              <Th>Lane</Th>
              <Th>Job</Th>
              <Th>Processing for</Th>
            </Thead>
            <tbody>
              {detail.stuckJobs.map((j) => (
                <Tr key={`${j.lane}-${j.id}`}>
                  <Td>{j.lane}</Td>
                  <Td>
                    {j.name} ({j.id})
                  </Td>
                  <Td>
                    <StatusBadge label={`${Math.round(j.processingForMs / 1000)}s`} tone="warning" />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title="Failed jobs" className="mt-4">
        <p className="mb-3 text-supporting text-ink-subtle">
          Real failures, retained on purpose (never auto-removed) so every one is reconcilable — never treated as proof the
          underlying action failed on the provider side too (see each domain module&rsquo;s own interruption-safety design
          for outreach sends / affiliate creation).
        </p>
        {detail.failedJobs.length === 0 ? (
          <p className="text-supporting text-ink-faint">None.</p>
        ) : (
          <Table>
            <Thead>
              <Th>Lane</Th>
              <Th>Job</Th>
              <Th>Attempts</Th>
              <Th>Reason</Th>
              <Th>When</Th>
              <Th>&nbsp;</Th>
            </Thead>
            <tbody>
              {detail.failedJobs.map((j) => (
                <Tr key={`${j.lane}-${j.id}`}>
                  <Td>{j.lane}</Td>
                  <Td>
                    {j.name} ({j.id})
                  </Td>
                  <Td>{j.attemptsMade}</Td>
                  <Td className="max-w-sm whitespace-normal">{j.failedReason}</Td>
                  <Td className="whitespace-nowrap">{new Date(j.timestamp).toLocaleString()}</Td>
                  <Td className="whitespace-nowrap">
                    <RetryJobButton lane={j.lane} jobId={j.id} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
