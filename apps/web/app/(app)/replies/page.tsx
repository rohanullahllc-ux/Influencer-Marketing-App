import { listInboundMessages } from "@rdv/domain";
import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../../lib/session";
import { ReplyRow } from "./ReplyRow";

const MATCH_STATUSES = ["matched", "ambiguous", "unknown"] as const;

/** Wave 3 (Reply Intelligence): the reply inbox — every inbound message, real classification, and a suggested response a human must still approve before anything is sent. */
export default async function RepliesPage({ searchParams }: { searchParams: { matchStatus?: string } }) {
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

  const matchStatusFilter = MATCH_STATUSES.includes(searchParams.matchStatus as (typeof MATCH_STATUSES)[number])
    ? (searchParams.matchStatus as (typeof MATCH_STATUSES)[number])
    : undefined;

  const messages = await listInboundMessages({ workspaceId: actor.workspaceId, actorUserId: actor.userId, matchStatus: matchStatusFilter });

  return (
    <main style={{ padding: 32, maxWidth: 760 }}>
      <h1>Replies</h1>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>
        Every inbound reply, matched to a creator/campaign where possible. AI classifies and may suggest a response — it never sends
        anything. A suggested response becomes a normal draft on <a href="/approvals">/approvals</a> that still needs human approval.
      </p>
      <p style={{ marginBottom: 16, fontSize: 13 }}>
        {MATCH_STATUSES.map((s) => (
          <a key={s} href={`/replies?matchStatus=${s}`} style={{ marginRight: 12, fontWeight: matchStatusFilter === s ? 700 : 400 }}>
            {s}
          </a>
        ))}
        <a href="/replies" style={{ fontWeight: matchStatusFilter ? 400 : 700 }}>
          all
        </a>
      </p>
      {messages.length === 0 ? (
        <p style={{ color: "#666" }}>No replies yet.</p>
      ) : (
        messages.map((m) => <ReplyRow key={m.id} message={m} />)
      )}
    </main>
  );
}
