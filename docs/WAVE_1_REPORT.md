# Wave 1 — Foundation: Build & Test Report

Status: **PASS**. All Wave 1 acceptance criteria from the locked Step 5
formal build plan (§5.1) are implemented and independently verified
against a real, running local Postgres 16 + Redis instance — not mocked,
not assumed. 30/30 Vitest tests pass; a full TypeScript type-check
(`noUncheckedIndexedAccess` on, repo-wide) is clean; `next build` succeeds
for the web app.

## What was built

| Area | Package/App | State |
|---|---|---|
| Monorepo scaffold | root, `apps/*`, `packages/*` | npm workspaces, shared `tsconfig.base.json` path aliases |
| DB schema + migrations + RLS | `packages/db` | Drizzle schema, 4 hand-written SQL migrations, `FORCE ROW LEVEL SECURITY` on every tenant table |
| Auth + workspace + RBAC | `packages/auth` | Workspace bootstrap, Owner/Admin/Member-Operator RBAC, no public signup |
| Queue lanes | `packages/queue` | 5 named BullMQ lanes (creator-discovery, outreach-send, whop-sync, webhook-ingest, ai-ops) |
| Notification dispatch | `packages/notifications` | In-app dispatch + unread/read, workspace-isolated |
| AI Orchestration skeleton | `packages/ai` | Operation registry, hard restriction enforcement, one stub operation |
| Credentials vault | `packages/lib` | AES-256-GCM encryption, round-trip tested |
| Logging | `packages/lib` | pino with secret-field redaction |
| Audit log | `packages/db` | Append-only helper, wired into every privileged auth mutation |
| Health check + Ops page | `apps/web` | `/api/health`, `/ops` — both read real DB/Redis/queue-depth state |
| Worker process | `apps/worker` | Per-lane BullMQ workers, fail-loud on unregistered job names |
| Backup / restore | `scripts/` | Tested round-trip against a real database |

## Acceptance criteria — verified, not assumed

Each of these was proven with a real test against real infrastructure
(`tests/*.test.ts`, run via `npm test`), not inferred from code review:

- **Cross-workspace RLS isolation**: a query scoped to workspace A returns
  zero rows from workspace B, for every tenant table, including the
  degenerate "workspace has no data yet" and "no workspace context set at
  all" cases.
- **RBAC enforcement**: Owner/Admin can add members; a Member-Operator
  cannot; only an Owner can create another Owner; a non-member of a
  workspace is rejected, not silently ignored.
- **Audit-log completeness**: workspace creation and every membership
  change writes exactly one audit row — including proving a genuine no-op
  re-add writes zero duplicate rows, and a real role change writes exactly
  one.
- **Queue-lane isolation**: exactly the 5 required lanes exist; a job
  enqueued in one lane never appears in another; a real BullMQ Worker
  processes a real job end-to-end; an unrecognized job name fails loudly
  instead of being silently marked complete.
- **AI Orchestration stub contract**: the stub operation runs and its
  result is tagged with AI provenance; calling an unregistered operation
  throws; registering (or even just validating the name of) an operation
  matching a forbidden action pattern (`send`, `approve`,
  `createAffiliate`, `automerge`, `activateCampaign`, etc.) throws at
  registration time.
- **Credential-encryption round-trip**: encrypt → decrypt returns the
  original plaintext; two encryptions of the same plaintext never produce
  the same ciphertext (random IV); a tampered auth tag fails to decrypt.
- **No public signup**: `createWorkspaceWithOwner` is the only way a
  workspace comes into existence, and it is never called from an
  unauthenticated path.

## Real bugs found and fixed during this wave

Listed because the Step 6 instructions require never marking a wave
complete without its acceptance criteria genuinely passing — these are
exactly the kind of thing that only surfaces by actually running code
against real infrastructure, which is why they're recorded here rather
than smoothed over:

1. **`client.ts` naming collision** (caught before first run): the
   postgres.js connection object and Drizzle's `sql` tagged-template
   helper were both bound to the identifier `sql`. Fixed by renaming the
   connection export to `queryClient`.
2. **RLS bootstrap deadlock**: `FORCE ROW LEVEL SECURITY` blocks even
   workspace-creation's own first insert, since the workspace being
   created has no `app.current_workspace_id` yet. Resolved with a
   narrowly-scoped, explicitly-documented `rdv_system` BYPASSRLS role,
   used only by two audited bootstrap functions (see
   `docs/DECISIONS.md` D2) — found by an actual failing `PostgresError`,
   not anticipated in advance.
3. **`onConflictDoUpdate` with an empty `set`**: Drizzle throws
   "No values to set" whenever an optional `name` field was omitted.
   Fixed with a self-referential `set: { name: newName ?? sql\`${col}\` }`
   no-op update pattern.
4. **RLS empty-string vs. NULL on pooled connections**: a Postgres custom
   GUC, once set at least once on a backend connection, reads as `''`
   (not `NULL`) in a later transaction where it isn't re-set — and
   `''::uuid` throws. The original policy crashed instead of safely
   denying all rows. Fixed (migration `0004`) with
   `nullif(current_setting(...), '')::uuid`, which is also immune to
   Postgres's undefined AND-operand evaluation order (confirmed directly:
   an `x <> '' and ...` guard, the first fix attempt in migration `0003`,
   still crashed).
5. **Backup/restore required the wrong Postgres role**: `pg_dump`/`psql`
   run as the ordinary `rdv_app` role fail under `FORCE ROW LEVEL
   SECURITY` (zero rows visible with no workspace context set). Must use
   `rdv_system`.
6. **`restore.sh` could silently "succeed" having restored nothing**: no
   `-v ON_ERROR_STOP=1`, so psql kept going past failed statements and
   still exited 0. Also found, in the same test, that `rdv_system` lacked
   `CREATE` on the `public` schema of a fresh database (Postgres 15+'s
   default schema-privilege revocation) — a real restore into an empty
   database failed with "permission denied for schema public" until both
   were fixed. Verified with both a full successful restore
   (row counts match source) and a deliberately corrupt backup file
   (correctly fails with a non-zero exit code).
7. **`noUncheckedIndexedAccess` type gaps**: several `.returning()`/
   `.select()` call sites destructured `[row]` without acknowledging
   Drizzle types these as possibly-empty arrays. Fixed with an explicit
   `oneOrThrow()` helper (throws a clear error rather than proceeding with
   `undefined`) instead of silencing the type error.

## Implementation decisions made (see `docs/DECISIONS.md` for full rationale)

- **D1**: Auth.js (not Clerk) — no external account/API key needed to
  build in this environment; workspace/RBAC domain logic is
  provider-agnostic so the real production sign-in method (OAuth or
  magic-link email) can be swapped in at deploy time without touching
  `packages/auth`.
- **D2**: a second, narrowly-scoped `rdv_system` BYPASSRLS Postgres role,
  used only by workspace bootstrap, cross-workspace lookup, and
  backup/restore — discovered as a necessity, not planned speculatively.
- **D3**: Drizzle ORM + hand-written SQL migrations (carried over from
  Step 5 planning).

## Scope check

Nothing built in Wave 1 touches product features (creators, campaigns,
outreach content, replies) — confirmed against the exclusion list in the
Step 6 instructions. `apps/web` has exactly two routes
(`/api/health`, `/ops`) plus the default landing page; `apps/worker` has
exactly one job processor, a smoke test, not a real business processor.
No Instagram integration, no ML, no billing, no microservices exist
anywhere in this codebase.

## Known gaps carried forward (not Wave 1 blockers)

- Auth.js is wired with a dev-only Credentials provider (no real
  OAuth/email provider configured in this sandbox) — a deployment-time
  task, documented in D1.
- `audit_log` append-only-ness is convention-enforced, not yet
  DB-enforced via `REVOKE UPDATE/DELETE` — flagged as a Wave 6 hardening
  item.
- No Docker/containerization — this environment has no Docker daemon;
  native Postgres/Redis services were used instead (see
  `docs/ENVIRONMENT.md`).

## Next

Wave 2 — Core Product + Safety Core (two parallel tracks, plus the
revised First Working Vertical Slice with real narrow YouTube discovery),
per the locked Step 5 build order.
