# RDV Outreach OS

Rohan Digital Ventures — Influencer Marketing Campaign & Outreach
Operating System (V1). Internal tool: invite-only workspaces, Owner /
Admin / Member-Operator roles, no public signup.

Architecture: a Next.js web/API app + a separate BullMQ worker process,
sharing one codebase and a set of domain packages (modular monolith — not
microservices). PostgreSQL is the single source of truth, with Row-Level
Security enforced in addition to (never instead of) application-layer
authorization. Redis + BullMQ provide 5 named queue lanes, one per
external dependency with its own rate-limit profile.

See:
- `docs/PRODUCT_VISION.md` — product vision, business workflow, V1 scope
  boundaries, and the locked seven-wave build plan.
- `docs/DECISIONS.md` — implementation decisions left open by the formal
  build plan (auth provider, the `rdv_system` bypass role, ORM), with
  rationale.
- `docs/ENVIRONMENT.md` — exact local dev setup steps.
- `docs/SECURITY.md` — tenant isolation, credential encryption, audit log.
- `docs/WAVE_1_REPORT.md` — Wave 1 (Foundation) build/test report.

## Layout

```
apps/
  web/       Next.js app (health check, minimal Operations page)
  worker/    BullMQ worker process
packages/
  db/        Drizzle schema, raw SQL migrations, RLS-enforced client
  auth/      Workspace bootstrap, RBAC, membership management
  queue/     Named BullMQ queue lane definitions
  notifications/  In-app/email notification dispatch (infrastructure only in Wave 1)
  ai/        Centralized AI Orchestration (registry + hard restrictions)
  lib/       Logging, encryption, error taxonomy
scripts/     backup.sh / restore.sh
tests/       Vitest acceptance tests, run against a real local Postgres + Redis
```

## Quick start

See docs/ENVIRONMENT.md for the full setup. Once Postgres/Redis are up and
env vars are set:

```bash
npm install
npm run migrate
npm run seed:dev
npm test
npm run web:dev      # http://localhost:3000
npm run worker:dev
```
