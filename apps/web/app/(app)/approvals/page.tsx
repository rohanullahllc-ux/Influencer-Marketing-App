import { listApprovalQueue, type ApprovalStatus } from "@rdv/domain";
import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../../lib/session";
import { ApprovalRow } from "./ApprovalRow";

const STATUSES: ApprovalStatus[] = ["pending", "approved", "rejected", "returned_for_edit", "invalidated"];

/** Wave 2 Phase 6 (plan §11): the single founder-facing approval queue across all campaigns. */
export default async function ApprovalsPage({ searchParams }: { searchParams: { status?: string } }) {
  let actor;
  try {
    actor = await requireSession();
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return (
        <main style={{ padding: 32 }}>
          <p>
            You must <a href="/login">sign in</a> to view this page.
          </p>
        </main>
      );
    }
    throw err;
  }

  const statusFilter = STATUSES.includes(searchParams.status as ApprovalStatus) ? (searchParams.status as ApprovalStatus) : undefined;
  const approvals = await listApprovalQueue({ workspaceId: actor.workspaceId, actorUserId: actor.userId, status: statusFilter });
  const canDecide = actor.role === "owner" || actor.role === "admin";

  return (
    <main style={{ padding: 32, maxWidth: 720 }}>
      <h1>Approvals</h1>
      <p style={{ marginBottom: 16, fontSize: 13 }}>
        {STATUSES.map((s) => (
          <a key={s} href={`/approvals?status=${s}`} style={{ marginRight: 12, fontWeight: statusFilter === s ? 700 : 400 }}>
            {s}
          </a>
        ))}
        <a href="/approvals" style={{ fontWeight: statusFilter ? 400 : 700 }}>
          all
        </a>
      </p>
      {!canDecide && (
        <p style={{ color: "#666", fontSize: 13, marginBottom: 16 }}>Only an Owner/Admin can approve, reject, or request edits.</p>
      )}
      {approvals.length === 0 ? (
        <p style={{ color: "#666" }}>No approvals{statusFilter ? ` with status "${statusFilter}"` : ""} yet.</p>
      ) : (
        approvals.map((a) => <ApprovalRow key={a.id} approval={a} canDecide={canDecide} />)
      )}
    </main>
  );
}
