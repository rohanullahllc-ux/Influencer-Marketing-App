export default function HomePage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>RDV Outreach OS</h1>
      <p>
        Wave 2 Phase 2 (Product + Intelligence) build. See{" "}
        <a href="/products">/products</a> to create a product and generate/
        review/approve AI Product Intelligence, <a href="/ops">/ops</a> for
        system health, <a href="/login">/login</a> to sign in,{" "}
        <a href="/settings/members">/settings/members</a> to manage
        workspace members, or <a href="/settings/integrations">
          /settings/integrations
        </a>{" "}
        to configure the YouTube/Anthropic API keys later phases need.
      </p>
    </main>
  );
}
