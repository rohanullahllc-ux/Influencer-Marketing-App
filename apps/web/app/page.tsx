export default function HomePage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>RDV Outreach OS</h1>
      <p>
        Wave 2 Phase 7 (Safety Core + Dry Run) build. See{" "}
        <a href="/products">/products</a> to create a product, generate/
        review/approve AI Product Intelligence, and run creator discovery;{" "}
        <a href="/creators">/creators</a> for every discovered or
        manually-added creator; <a href="/campaigns">/campaigns</a> to set
        up a campaign, shortlist creators, assign outreach templates by
        segment, run deterministic qualification + AI matching, generate
        personalized outreach drafts, and run the safety-gate dry run;{" "}
        <a href="/approvals">/approvals</a> for the single founder-facing
        queue to approve, reject, or request edits on exact message
        content; <a href="/suppressions">/suppressions</a> for the durable
        do-not-contact list; <a href="/templates">/templates</a> to manage
        outreach templates; <a href="/ops">/ops</a> for system health,{" "}
        <a href="/login">/login</a> to sign in,{" "}
        <a href="/settings/members">/settings/members</a> to manage
        workspace members, or <a href="/settings/integrations">
          /settings/integrations
        </a>{" "}
        to configure the YouTube/Anthropic API keys this and later phases
        need. No real outreach is ever sent — the safety-gate dry run is
        the furthest this wave goes.
      </p>
    </main>
  );
}
