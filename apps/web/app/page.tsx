export default function HomePage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>RDV Outreach OS</h1>
      <p>
        Wave 2 Phase 0 (Auth + Credentials) build. Product features (Phase 1+)
        do not exist yet — see <a href="/ops">/ops</a> for system health,{" "}
        <a href="/login">/login</a> to sign in, <a href="/settings/members">
          /settings/members
        </a>{" "}
        to manage workspace members, or <a href="/settings/integrations">
          /settings/integrations
        </a>{" "}
        to configure the YouTube/Anthropic API keys later phases need.
      </p>
    </main>
  );
}
