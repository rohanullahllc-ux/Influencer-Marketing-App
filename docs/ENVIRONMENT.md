# Environment Setup (Wave 1 / local dev)

This documents the exact steps used to stand up the local dev environment
for this repo — captured from what was actually run and verified, not a
theoretical checklist. There is no Docker Compose file yet (the build
environment this was developed in has no Docker daemon); a containerized
setup is a reasonable later addition but everything here works directly
against native Postgres 16 + Redis.

## 1. Postgres

Requires Postgres 16+ (uses `gen_random_uuid()` via `pgcrypto`, and role
`BYPASSRLS`, both available since long before 16, but developed against 16).

```bash
service postgresql start   # or your platform's equivalent
```

Create two roles and (at least) two databases — one app role used by the
running application, and one narrowly-scoped system role used only for
the bootstrap/backup operations described in docs/DECISIONS.md D2:

```sql
CREATE ROLE rdv_app WITH LOGIN PASSWORD '<app-password>' CREATEDB;
CREATE ROLE rdv_system WITH LOGIN PASSWORD '<system-password>' BYPASSRLS;

CREATE DATABASE rdv_dev OWNER rdv_app;
CREATE DATABASE rdv_test OWNER rdv_app;   -- used only by `npm test`

-- For EACH database above:
GRANT ALL PRIVILEGES ON DATABASE rdv_dev TO rdv_system;
\c rdv_dev
GRANT ALL ON SCHEMA public TO rdv_system;
GRANT ALL ON ALL TABLES IN SCHEMA public TO rdv_system;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO rdv_system;
```

**The `GRANT ALL ON SCHEMA public` step is not optional** — found the hard
way while testing scripts/restore.sh: Postgres 15+ revokes CREATE on the
`public` schema from everyone except the schema owner by default, so
without this grant `rdv_system` can connect and SELECT/INSERT into
existing tables (via the DATABASE-level grant) but cannot run the
CREATE TABLE/CREATE TYPE statements a restore-into-a-fresh-database needs,
and — because restore.sh originally lacked `-v ON_ERROR_STOP=1` — that
failure was silent (see docs/DECISIONS.md D2 note and the fix in
scripts/restore.sh).

## 2. Redis

```bash
redis-server --daemonize yes --port 6379
redis-cli ping   # -> PONG
```

## 3. Environment variables

| Variable | Example (dev) | Notes |
|---|---|---|
| `DATABASE_URL` | `postgres://rdv_app:...@127.0.0.1:5432/rdv_dev` | The ordinary, RLS-enforced app connection. |
| `SYSTEM_DATABASE_URL` | `postgres://rdv_system:...@127.0.0.1:5432/rdv_dev` | BYPASSRLS — see docs/DECISIONS.md D2. Used only by packages/auth's bootstrap functions and scripts/backup.sh / restore.sh. |
| `REDIS_URL` | `redis://127.0.0.1:6379` | |
| `CREDENTIALS_MASTER_KEY` | a long random string, 16+ chars | Never commit a real value. See docs/SECURITY.md. |
| `LOG_LEVEL` | `info` | pino level. |
| `AUTH_SECRET` | a long random string, 32+ chars | Wave 2 Phase 0: Auth.js JWT signing secret. Never commit a real value. Generate with `openssl rand -base64 32`. |
| `AUTH_TRUST_HOST` | `true` | Wave 2 Phase 0: Auth.js v5 refuses to trust the request `Host` header by default (`UntrustedHost` error on every `/api/auth/*` call) unless told to — the correct setting for this single-process app with no trusted reverse proxy in front of it. Found by actually running the built server and exercising sign-in, not assumed. |

Tests do not read these from the shell — `tests/setup.ts` defaults them to
a dedicated `rdv_test` database so `npm test` never touches `rdv_dev`
(using `??=`, so an explicitly-exported value still wins, which is exactly
what caused a confusing transient test failure during Wave 1 development
when a leftover `DATABASE_URL=...rdv_dev` was still exported in the same
shell session — a reminder to run tests in a clean environment).

## 4. Bootstrap

```bash
npm install
npm run migrate     # applies packages/db/src/migrations/*.sql in order
npm run seed:dev     # creates a dev workspace with an owner + one member
npm test             # full Wave 1+2 suite against rdv_test
```

### Wave 2 Phase 0: first sign-in

`seed:dev` creates users but sets no password (there's no public signup —
see docs/DECISIONS.md D1/D4). To actually sign in, bootstrap the seeded
Owner's first credential, then use the normal in-app flow for everyone
after:

```bash
npm run issue-setup-token -- --email owner@rdv.local
# prints: /setup-account?token=<...>
# open http://localhost:3000/setup-account?token=<...> and set a password
```

Once the Owner can sign in, they provision further members from
`/settings/members` (issues a setup link the same way, without needing
script/DB access) — `issue-setup-token` is a bootstrap-only escape hatch
for the first account, same trust tier as `seed-dev.ts` itself.

## 5. Running the apps

```bash
npm run web:dev      # apps/web, Next.js dev server
npm run worker:dev    # apps/worker, BullMQ worker process
```
