# RDV Outreach OS — Implementation Decisions Log

Records decisions the Step 5 formal plan explicitly left to the implementer,
plus any other significant implementation-time choice made while executing
Step 6, with rationale. This is a living document — append, do not rewrite
history.

## D1 — Auth provider: Auth.js (not Clerk)

**Decision:** Use Auth.js (next-auth v5) for authentication in `apps/web`,
backed by our own Postgres `users`/`workspace_members` tables via a custom
adapter, rather than Clerk.

**Rationale:**
- Clerk requires an external account signup and live API keys before any
  code can even run; that dependency does not exist in this build
  environment and would block Wave 1 entirely on an external vendor
  relationship the business has not yet set up. Auth.js needs no external
  account to develop and test against.
- The V1 scope is invite-only, single-organization-operated workspaces with
  three roles (Owner/Admin/Member-Operator) — a comparatively simple auth
  surface. Auth.js's session/credential primitives cover this without
  pulling in Clerk's broader (and V1-irrelevant) organization-management,
  billing-adjacent, and multi-tenant UI surface — some of which overlaps
  with functionality this system deliberately builds itself (workspaces,
  roles) and would create two competing sources of truth for "who is in
  this workspace."
  Note: RDV's Whop integration is the product's own payments/community
  surface for *its customers* (creators/audience) — unrelated to Clerk,
  which would only ever have been about *operator* login for this internal
  tool.
- Auth.js keeps identity data inside our own Postgres instance (the schema
  already defined in packages/db), consistent with the single-source-of-
  truth requirement and avoiding a second system holding user records that
  must be kept in sync.
- Downside accepted: Auth.js requires us to implement more ourselves
  (adapter, session handling) than Clerk's drop-in components would. This
  is judged acceptable because the auth surface is intentionally small.

**Production note:** Wave 1 wires Auth.js with a dev-only Credentials
provider (email-only, no password — see packages/auth and
apps/web/src/auth.ts) because this sandboxed build environment has no real
OAuth app registrations or transactional-email provider credentials. Before
any real deployment, the Credentials provider must be replaced with a real
provider (e.g. Google OAuth, or Auth.js's Email/magic-link provider backed
by a real transactional email sender) — this is a deployment-configuration
task, not a Wave 1 architectural gap: the workspace/RBAC domain logic in
packages/auth is provider-agnostic and does not change when the front-door
sign-in method changes.

## D2 — A second, RLS-bypassing Postgres role (`rdv_system`) for workspace bootstrap only

**Decision:** Introduce a second Postgres role, `rdv_system`, with the
`BYPASSRLS` attribute, used exclusively by `packages/db/src/systemClient.ts`
and only called from two functions in `packages/auth/src/workspaces.ts`:
`createWorkspaceWithOwner` and `listWorkspacesForUser`.

**Rationale:** `workspace_members` (and every other tenant-scoped table) is
under `FORCE ROW LEVEL SECURITY`, keyed on the `app.current_workspace_id`
session variable — by design, per the Step 5 plan, this applies even to the
table owner, so there is no implicit superuser escape hatch. Two operations
are structurally incompatible with "set the workspace id, then query":
creating a workspace (the workspace_id being written doesn't exist until
partway through the transaction) and listing every workspace a user belongs
to (the caller does not know in advance which workspace_id to scope to —
answering that question *is* the query). Rather than weaken RLS globally or
scatter ad hoc bypasses, a single narrowly-scoped role is used, gated behind
exactly two audited functions, with the danger and the restriction spelled
out in code comments at both the role's connection module and its call
sites. This was discovered empirically: the first `seed-dev.ts` run failed
with a real `PostgresError: new row violates row-level security policy`
against the live database, which is what surfaced the need for this
decision rather than it being anticipated up front.

## D3 — ORM: Drizzle + hand-written SQL migrations

(Carried forward from the Step 5 planning discussion, recorded here for a
single decisions-log location.) Drizzle ORM for type-safe query building;
migrations are hand-written raw SQL (not drizzle-kit generated) so that RLS
DDL (`force row level security`, policy definitions) is fully under our
control rather than inferred from schema diffing.
