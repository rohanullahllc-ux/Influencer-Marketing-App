/**
 * Wave 2 Phase 0 bootstrap script: issues a one-time account-setup token
 * for a user directly, bypassing the RBAC-gated API (which structurally
 * cannot help the very first Owner — they have no session yet to call it
 * with). Same trust tier as scripts/seed-dev.ts and scripts/backup.sh:
 * intended to be run by an operator with direct access to this
 * environment, never exposed over HTTP. See
 * packages/auth/src/onboarding.ts `issueSetupTokenForBootstrap`.
 *
 * Usage: npm run issue-setup-token -- --email owner@rdv.local
 */
import { issueSetupTokenForBootstrap } from "@rdv/auth";
import { queryClient } from "@rdv/db";
import { systemQueryClient } from "@rdv/db/systemClient";
import { getLogger } from "@rdv/lib";

const log = getLogger({ module: "issue-setup-token" });

function parseEmailArg(): string {
  const flagIndex = process.argv.indexOf("--email");
  const email = flagIndex !== -1 ? process.argv[flagIndex + 1] : undefined;
  if (!email) {
    throw new Error("Usage: npm run issue-setup-token -- --email <email>");
  }
  return email;
}

async function main() {
  const email = parseEmailArg();
  const { token, expiresAt } = await issueSetupTokenForBootstrap(email);

  // Deliberately console.log (not the pino logger, which is meant for
  // structured/redacted operational logs) — this token is the whole point
  // of running the script and must be visibly copyable from stdout.
  // eslint-disable-next-line no-console
  console.log(`\nSetup link for ${email} (expires ${expiresAt.toISOString()}):`);
  // eslint-disable-next-line no-console
  console.log(`  /setup-account?token=${token}\n`);
}

main()
  .catch((err) => {
    log.error({ err }, "issue-setup-token failed");
    process.exit(1);
  })
  .finally(async () => {
    // Both pools must be closed — issueSetupTokenForBootstrap's call to
    // listWorkspacesForUser opens the separate systemQueryClient pool
    // (@rdv/db/systemClient), which otherwise keeps the process alive
    // indefinitely after main() resolves (mirrors scripts/seed-dev.ts).
    await queryClient.end();
    await systemQueryClient.end();
  });
