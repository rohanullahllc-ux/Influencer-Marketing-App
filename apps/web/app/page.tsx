export default function HomePage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>RDV Outreach OS</h1>
      <p>
        Wave 2 Phase 4 (Campaign + Templates) build. See{" "}
        <a href="/products">/products</a> to create a product, generate/
        review/approve AI Product Intelligence, and run creator discovery;{" "}
        <a href="/creators">/creators</a> for every discovered or
        manually-added creator; <a href="/campaigns">/campaigns</a> to set
        up a campaign, shortlist creators, and assign outreach templates by
        segment; <a href="/templates">/templates</a> to manage outreach
        templates; <a href="/ops">/ops</a> for system health,{" "}
        <a href="/login">/login</a> to sign in,{" "}
        <a href="/settings/members">/settings/members</a> to manage
        workspace members, or <a href="/settings/integrations">
          /settings/integrations
        </a>{" "}
        to configure the YouTube/Anthropic API keys this and later phases
        need.
      </p>
    </main>
  );
}
