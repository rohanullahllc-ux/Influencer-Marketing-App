# Security notes (Wave 1 Foundation)

## Tenant isolation

Every workspace-scoped table is under `FORCE ROW LEVEL SECURITY`, keyed on
the `app.current_workspace_id` Postgres session variable, set
transaction-locally by `withWorkspace()` (packages/db/src/client.ts) —
never for the life of a pooled connection, so it can never leak across
requests. RLS is defense-in-depth: every code path that reads/writes
tenant data must ALSO pass an application-layer authorization check
(packages/auth's `requireRole`) — RLS alone only proves "this row belongs
to workspace X," never "this actor is allowed to see/change it."

A real bug found and fixed during Wave 1 build/test (see
packages/db/src/migrations/0003 and 0004): a pooled connection that has
had the session variable set at least once, in a later transaction where
it is unset, sees `''` (empty string) rather than `NULL` from
`current_setting(..., true)`. The RLS policies use
`nullif(current_setting(...), '')::uuid` specifically to make an
unscoped query fail safe (zero rows) rather than throw or, worse, match
unintended rows.

## The `rdv_system` (BYPASSRLS) role

A second Postgres role exists specifically to bypass RLS, and its use is
restricted by convention + code comments (not yet by a lint rule — a Wave
6 hardening candidate) to: workspace bootstrap
(`createWorkspaceWithOwner`), cross-workspace lookup
(`listWorkspacesForUser`), and the backup/restore scripts. See
docs/DECISIONS.md D2 for the full rationale. **Never** import
`@rdv/db/systemClient` from ordinary feature code.

## Credentials vault

Third-party API credentials (`integration_credentials` table) are never
stored in plaintext. `packages/lib/src/encryption.ts` implements
AES-256-GCM with a per-value random IV; the key is derived (scrypt) from
`CREDENTIALS_MASTER_KEY`, which must be a long random value from a real
secret store in any non-local environment — it is never committed, and
`encryptSecret`/`decryptSecret` refuse to run without it.

## Logging

`packages/lib/src/logger.ts` redacts common secret-shaped field names
(`password`, `token`, `apiKey`, `secret`, `credential(s)`,
`encryptedPayload`, `authorization`) at the pino config level. This is a
safety net, not a substitute for not logging secrets in the first place —
never pass a raw credential object to a log call and rely on redaction to
save you.

## No public signup

There is no unauthenticated endpoint anywhere in this codebase that
creates a workspace or a user. `createWorkspaceWithOwner` is only ever
invoked from an already-authenticated, already-privileged context (see
docs/DECISIONS.md D1).

## Audit log

`writeAuditLog` (packages/db/src/audit.ts) is append-only by convention.
Every privileged mutation implemented so far (workspace creation,
membership add/role-change) writes an audit row in the same transaction
as the mutation itself, so the two can never drift. DB-level enforcement
(REVOKE UPDATE/DELETE on `audit_log` from `rdv_app`) is a Wave 6 hardening
item, not a Wave 1 blocker.
