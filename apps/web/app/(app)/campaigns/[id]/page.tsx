import {
  getCampaign,
  listCampaignCreators,
  listCampaignTemplates,
  listCreators,
  listTemplates,
  listCurrentQualifications,
  listCurrentMatches,
  getCampaignAnalytics,
} from "@rdv/domain";
import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../../../lib/session";
import { ShortlistPanel } from "./ShortlistPanel";
import { TemplateAssignmentPanel } from "./TemplateAssignmentPanel";
import { QualificationMatchingPanel } from "./QualificationMatchingPanel";
import { OutreachDraftPanel } from "./OutreachDraftPanel";
import { DryRunPanel } from "./DryRunPanel";
import { SendsPanel } from "./SendsPanel";

/** Wave 2 Phase 4/5/6/7 (plan §9, §10, §11, §12): campaign detail — every locked field, the creator shortlist, template assignment by segment, deterministic qualification + AI matching, outreach draft generation, and the safety-gate dry run. */
export default async function CampaignDetailPage({ params }: { params: { id: string } }) {
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

  const campaign = await getCampaign({ workspaceId: actor.workspaceId, actorUserId: actor.userId, campaignId: params.id });
  const [shortlisted, allCreators, assignments, allTemplates, qualifications, matches, analytics] = await Promise.all([
    listCampaignCreators({ workspaceId: actor.workspaceId, actorUserId: actor.userId, campaignId: params.id }),
    listCreators({ workspaceId: actor.workspaceId, actorUserId: actor.userId }),
    listCampaignTemplates({ workspaceId: actor.workspaceId, actorUserId: actor.userId, campaignId: params.id }),
    listTemplates({ workspaceId: actor.workspaceId, actorUserId: actor.userId }),
    listCurrentQualifications({ workspaceId: actor.workspaceId, actorUserId: actor.userId, campaignId: params.id }),
    listCurrentMatches({ workspaceId: actor.workspaceId, actorUserId: actor.userId, campaignId: params.id }),
    getCampaignAnalytics({ workspaceId: actor.workspaceId, actorUserId: actor.userId, campaignId: params.id }),
  ]);
  const shortlistedCreators = allCreators.filter((c) => shortlisted.some((s) => s.creatorId === c.id));

  return (
    <main style={{ padding: 32, maxWidth: 720 }}>
      <p>
        <a href="/campaigns">← Campaigns</a>
      </p>
      <h1>{campaign.name}</h1>
      <p style={{ fontSize: 13, color: "#666" }}>Status: {campaign.status}</p>
      {campaign.objective && <p>{campaign.objective}</p>}

      <table cellPadding={4} style={{ fontSize: 13, marginBottom: 24 }}>
        <tbody>
          <tr>
            <td style={{ color: "#666" }}>Target geography</td>
            <td>{(campaign.targetGeography as string[] | null)?.join(", ") || "—"}</td>
          </tr>
          <tr>
            <td style={{ color: "#666" }}>Target languages</td>
            <td>{(campaign.targetLanguages as string[] | null)?.join(", ") || "—"}</td>
          </tr>
          <tr>
            <td style={{ color: "#666" }}>Creator types</td>
            <td>{(campaign.creatorTypes as string[] | null)?.join(", ") || "—"}</td>
          </tr>
          <tr>
            <td style={{ color: "#666" }}>Niche requirements</td>
            <td>{(campaign.nicheRequirements as string[] | null)?.join(", ") || "—"}</td>
          </tr>
          <tr>
            <td style={{ color: "#666" }}>Qualification thresholds</td>
            <td>{campaign.qualificationThresholds ? JSON.stringify(campaign.qualificationThresholds) : "—"}</td>
          </tr>
          <tr>
            <td style={{ color: "#666" }}>Dates</td>
            <td>
              {campaign.startDate ?? "—"} → {campaign.endDate ?? "—"}
            </td>
          </tr>
          <tr>
            <td style={{ color: "#666" }}>First-send cap</td>
            <td>{campaign.firstSendCap ?? "—"}</td>
          </tr>
          <tr>
            <td style={{ color: "#666" }}>Sending limits</td>
            <td>{campaign.sendingLimits ? JSON.stringify(campaign.sendingLimits) : "—"}</td>
          </tr>
        </tbody>
      </table>

      <h2>Analytics</h2>
      <p style={{ fontSize: 13, marginBottom: 24 }}>
        {analytics.shortlist.total} shortlisted · {analytics.qualification.passed}/{analytics.qualification.totalCurrentlyEvaluated} qualified
        · {analytics.matching.totalCurrentlyMatched} matched
        {analytics.matching.averageScore !== null ? ` (avg score ${analytics.matching.averageScore.toFixed(2)})` : ""} ·{" "}
        {analytics.outreach.totalDrafts} drafts · {analytics.sends.total} sends · {analytics.replies.total} replies. See{" "}
        <a href="/analytics">/analytics</a> for the full workspace rollup.
      </p>

      <h2>Creator shortlist</h2>
      <ShortlistPanel campaignId={campaign.id} allCreators={allCreators} shortlisted={shortlisted} />

      <h2 style={{ marginTop: 32 }}>Template assignment</h2>
      <TemplateAssignmentPanel campaignId={campaign.id} allTemplates={allTemplates} assignments={assignments} />

      <h2 style={{ marginTop: 32 }}>Qualification + Matching</h2>
      <QualificationMatchingPanel
        campaignId={campaign.id}
        shortlistedCreators={shortlistedCreators}
        initialQualifications={qualifications}
        initialMatches={matches}
      />

      <h2 style={{ marginTop: 32 }}>Outreach Drafts</h2>
      <OutreachDraftPanel campaignId={campaign.id} shortlistedCreators={shortlistedCreators} />

      <h2 style={{ marginTop: 32 }}>Safety Gate / Dry Run</h2>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>
        Shows eligible vs. blocked messages with exact reasons. No real email is ever sent from this screen or anywhere in this codebase.
      </p>
      <DryRunPanel campaignId={campaign.id} shortlistedCreators={shortlistedCreators} />

      <h2 style={{ marginTop: 32 }}>Sends</h2>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>
        Real send history. Schedule a send from an approved message on <a href="/approvals">/approvals</a>.
      </p>
      <SendsPanel campaignId={campaign.id} shortlistedCreators={shortlistedCreators} />
    </main>
  );
}
