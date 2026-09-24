import {
  getCreator,
  getCreatorRelationship,
  listCreatorNotes,
  listCreatorTasks,
  getCreatorHistory,
  listCreatorConversationSummaries,
  listCreatorAffiliatesForCreator,
} from "@rdv/domain";
import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../../lib/session";
import { RelationshipPanel } from "./RelationshipPanel";
import { NotesPanel } from "./NotesPanel";
import { TasksPanel } from "./TasksPanel";
import { SummaryPanel } from "./SummaryPanel";
import { AffiliatePanel } from "./AffiliatePanel";

/**
 * Wave 4 (Creator CRM + Whop): the operational creator detail page —
 * lifecycle/relationship status, notes, tasks, real outreach/reply
 * history (read live from Wave 3's tables, never duplicated), AI
 * conversation summaries, and the human-triggered Whop affiliate
 * relationship + real (Mock-provider, for now) conversion history.
 */
export default async function CreatorDetailPage({ params }: { params: { id: string } }) {
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

  const creatorId = params.id;
  const [creator, relationship, notes, tasks, history, summaries, affiliates] = await Promise.all([
    getCreator({ workspaceId: actor.workspaceId, actorUserId: actor.userId, creatorId }),
    getCreatorRelationship({ workspaceId: actor.workspaceId, actorUserId: actor.userId, creatorId }),
    listCreatorNotes({ workspaceId: actor.workspaceId, actorUserId: actor.userId, creatorId }),
    listCreatorTasks({ workspaceId: actor.workspaceId, actorUserId: actor.userId, creatorId }),
    getCreatorHistory({ workspaceId: actor.workspaceId, actorUserId: actor.userId, creatorId }),
    listCreatorConversationSummaries({ workspaceId: actor.workspaceId, actorUserId: actor.userId, creatorId }),
    listCreatorAffiliatesForCreator({ workspaceId: actor.workspaceId, actorUserId: actor.userId, creatorId }),
  ]);

  return (
    <main style={{ padding: 32, maxWidth: 760 }}>
      <p>
        <a href="/creators">← Creators</a>
      </p>
      <h1>{creator.displayName ?? creator.channelUrl ?? "Creator"}</h1>
      <p style={{ fontSize: 13, color: "#666" }}>
        {creator.platform} · {creator.provenance} · {creator.contactEmail ?? "no contact email on file"}
      </p>

      <h2 style={{ marginTop: 24 }}>Relationship</h2>
      <RelationshipPanel creatorId={creatorId} relationship={relationship} />

      <h2 style={{ marginTop: 32 }}>AI conversation summary</h2>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>
        Summarizes the real outreach/reply history below — never invents facts, always grounded in the actual thread. Read-only: never changes
        anything.
      </p>
      <SummaryPanel creatorId={creatorId} initialSummaries={summaries} hasHistory={history.outreachSends.length + history.inboundMessages.length > 0} />

      <h2 style={{ marginTop: 32 }}>Outreach + reply history</h2>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>Real data from the actual send/reply pipeline — nothing duplicated here.</p>
      {history.outreachSends.length === 0 && history.inboundMessages.length === 0 ? (
        <p style={{ color: "#666" }}>No outreach or replies yet for this creator.</p>
      ) : (
        <table cellPadding={6} style={{ borderCollapse: "collapse", width: "100%", fontSize: 13, marginBottom: 16 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
              <th>Direction</th>
              <th>When</th>
              <th>Status / Subject</th>
            </tr>
          </thead>
          <tbody>
            {history.outreachSends.map((s) => (
              <tr key={s.id} style={{ borderBottom: "1px solid #eee" }}>
                <td>Outbound</td>
                <td>{(s.sentAt ?? s.createdAt).toLocaleString()}</td>
                <td>
                  {s.status} ({s.outreachStep})
                </td>
              </tr>
            ))}
            {history.inboundMessages.map((m) => (
              <tr key={m.id} style={{ borderBottom: "1px solid #eee" }}>
                <td>Inbound</td>
                <td>{m.receivedAt.toLocaleString()}</td>
                <td>
                  {m.subject ?? "(no subject)"} — {m.classification ?? m.matchStatus}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 style={{ marginTop: 32 }}>Notes</h2>
      <NotesPanel creatorId={creatorId} initialNotes={notes} />

      <h2 style={{ marginTop: 32 }}>Tasks</h2>
      <TasksPanel creatorId={creatorId} initialTasks={tasks} />

      <h2 style={{ marginTop: 32 }}>Whop affiliate</h2>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>
        Human-triggered only — nothing here happens automatically. No real Whop credentials are configured in this environment; creation runs
        against a real, deterministic Mock provider so the full flow is testable now.
      </p>
      <AffiliatePanel creatorId={creatorId} initialAffiliates={affiliates} />
    </main>
  );
}
