# Autonomous V1 Progress

Tracks the autonomous Wave 3–7 build. Read this file (and its machine-readable
twin `docs/AUTONOMOUS_V1_PROGRESS.json`) at the start of every continuation —
before trusting conversation memory. Update both together.

## Critical finding from investigation (2026-09-22)

**No outreach send provider has been selected anywhere in this repository.**
Evidence:
- `packages/db/src/schema.ts` `credentialProviderEnum` = `["youtube", "outreach_provider", "whop", "anthropic"]`
  — a generic placeholder name, not `gmail`/`resend`/`sendgrid`/etc.
- No provider SDK in any `package.json` (`googleapis`, `resend`, `nodemailer`, `@sendgrid/*` — none present).
- No mention of a chosen provider in `docs/PRODUCT_VISION.md` or `docs/DECISIONS.md`.
- `integration_credentials` table has zero rows in the dev DB.

Per the mission's own rule ("If NO provider has been selected ... stop at
THAT decision only"), **live sending and live reply-webhook ingestion are
blocked on that decision** — this is the one open question flagged to the
user, not a reason to halt everything else. Everything else in Wave 3
(schema, safety-gate-integrated send execution, idempotency, retries,
history, Mock provider, reply persistence/classification/suggested-response
against the Mock provider) is being built now and is fully testable without
external credentials.

## PR #7 (`claude-skill/digitalventures-influencer-ops-v1`)

Confirmed NOT a source of truth, NOT to be merged, NOT touched. This repo's
own docs + code are authoritative, per the mission.

## Wave status

- Wave 0–2: **done**, merged to `main` (commit `94ccf53`). 181/181 tests,
  clean typecheck, clean build (verified in a prior session; see PR history
  #1–#6).
- Wave 3 (Live Outreach + Reply Intelligence): **done**. 38 files / 212
  tests, clean typecheck, clean build.
- Wave 4 (Creator CRM + Whop): **done**. 43 files / 240 tests, clean
  typecheck, clean build. See "Wave 4 — detailed checklist" below.
- Wave 5 (Analytics): **done**. 44 files / 243 tests, clean typecheck,
  clean build. See "Wave 5 — detailed checklist" below.
- Wave 6 (Hardening): not started
- Wave 7 (E2E Validation): not started

## Branch

`claude/rdv-project-context-3ckcrw`, reset from `main` @ `94ccf53` (the prior
PR for this branch was merged, so per the standing branch convention this
branch restarts from current main rather than stacking on old history).

## Wave 3 — detailed checklist

### 3.1 Schema (migration 0007)
- [ ] `send_status` enum, `outreach_sends` table (idempotency key, schedule,
      recipient identity, provider, provider message/thread id, status,
      attempt count, timestamps)
- [ ] `outreach_send_attempts` table (append-only per-attempt history)
- [ ] `reply_classification` / `reply_match_status` enums, `inbound_messages`
      table
- [ ] `outreach_drafts.in_reply_to_inbound_message_id` (nullable FK)
- [ ] `inbound_messages.suggested_draft_id` (nullable FK, set after a
      suggested-response draft is generated)
- [ ] `provider_mailbox_state` table (generic sync-cursor/watch-expiry state,
      so the real Gmail history/watch model can be wired in later without a
      schema change)
- [ ] RLS policies for every new table, `FORCE ROW LEVEL SECURITY`, same
      `nullif(current_setting(...), '')::uuid` shape as every prior migration
- [ ] `schema.ts` mirror

### 3.2 Outreach provider abstraction + Mock provider
- [ ] `packages/domain/src/outreachProvider.ts` — minimal interface
      (`sendEmail`), registry (mirrors `@rdv/ai`'s registration pattern —
      one centralized module, not a generic multi-vendor plugin system),
      `MockOutreachProvider` (deterministic, real, no network calls; can
      simulate a reply for test/dev purposes via an explicit test-only
      helper, never automatically)
- [ ] No Gmail-specific code yet — that is the flagged blocker

### 3.3 Send execution domain + worker — DONE
- [x] `packages/domain/src/outreachSend.ts`: `scheduleSend`,
      `executeScheduledSend` (worker-only), idempotency (workspace-scoped
      unique key, `onConflictDoNothing`), cross-campaign contact safeguard
      (`crossCampaignContact.ts`, shared with dry-run so previews and real
      execution always agree), re-runs the full Phase 7 safety gate for
      real at execution time (never trusts a stale dry-run)
- [x] Extended `safetyGate.ts` with `crossCampaignBlocked`/
      `crossCampaignOverride` (product vision names this as part of the
      same centralized gate) — pure function, no DB access added
- [x] `packages/domain/src/outreachProvider.ts` + `providers/
      mockOutreachProvider.ts`: minimal registry (mirrors `@rdv/ai`'s
      pattern), real deterministic Mock provider (test-address convention
      for sent/failed/unknown, same spirit as payment-provider test cards)
- [x] `apps/worker/src/processors/outreachSend.ts`: `outreach_send_execute`
      job on the `outreach-send` lane
- [x] **Interruption safety, proven by test, not just designed**: a send
      found already in `sending` state (crash after contacting the
      provider) is marked `unknown` and the provider is never called
      again — verified with a `+mockfail` address that would prove a
      blind retry occurred if the safeguard were missing
- [x] API routes: `POST/GET /api/campaigns/:id/sends`,
      `GET /api/campaigns/:id/sends/:sendId` (polls the durable DB row,
      not a BullMQ job id, since a far-future scheduled send may not run
      for a long time)
- [x] UI: "Schedule send" on an approved row in `/approvals`; a real,
      polled Sends status panel on the campaign detail page
- [x] Tests (17 new): `domain.outreachSend.test.ts` (15 — happy path,
      rejects unapproved/no-email, idempotent re-schedule, suppressed,
      paused campaign, kill switch, first-send cap, cross-campaign
      safeguard + override, unknown outcome, failed outcome, interruption
      safety, safe no-op re-execution) + `worker.outreachSend.test.ts` (1,
      real BullMQ end-to-end, genuine success since Mock makes no network
      calls) + 3 new safety-gate unit tests for the cross-campaign
      addition
- [x] Verification: migrations 0007–0009 apply cleanly to both databases;
      `tsc --noEmit` clean; full suite 36 files / 200 tests passing;
      `next build` clean, new routes present

### 3.4 Reply intelligence — DONE
- [x] `packages/domain/src/replies.ts`: `ingestInboundMessage` (matches to
      creator/campaign/outreach by normalized recipient identity;
      `matched` requires both a uniquely-identified creator AND a real
      prior `sent` outreach_sends row; a known creator with no send
      history, or multiple creators sharing an email, is `ambiguous`; no
      creator match at all is `unknown`), deduped on (workspace, provider,
      provider_message_id) — a replayed webhook delivery is a true no-op,
      never re-matched/re-classified
- [x] `packages/ai/src/operations/classifyReply.ts` +
      `draftReplyResponse.ts`: Interested / Not Interested / Needs Human
      Review + confidence + limitations + extractedFacts; a second
      operation drafts a suggested response ONLY for interested/
      needs_human_review AND only when matched to a real campaign+creator
      — never for not_interested, never for an unmatched/ambiguous reply.
      The suggested response becomes a normal `outreach_drafts` row (new
      `in_reply_to_inbound_message_id` FK) that goes through the exact
      same approval + safety-gate + send pipeline as any other outreach —
      reusing existing infrastructure, not a parallel reply-send path.
      Refactored to match the established layering exactly: the AI calls
      live in the worker processor (`apps/worker/src/processors/
      replyIntelligence.ts`), not in packages/domain — same split as
      Phase 5/6's creatorMatching.ts/outreachDraft.ts processors, so every
      domain-level test stays fully deterministic (no AI/network)
- [x] `apps/worker/src/processors/replyReconciliationPoll.ts` +
      `packages/domain/src/providerMailboxState.ts`: the
      webhook-primary-with-reconciliation-polling-backstop scaffolding
      (generic sync_cursor/watch_expires_at bookkeeping, not Gmail-
      specific) — proves the pattern now; a real provider only has to
      plug in the actual "fetch since cursor" call later
- [x] **Deliberately did NOT build a public/unauthenticated webhook HTTP
      endpoint.** No real provider exists yet to define a signing/
      verification scheme, and an unauthenticated public ingestion
      endpoint with nothing real to verify against would be a genuine
      security hole, not a scaffold — building a fake auth scheme would
      be worse than not having the endpoint. Real signature verification
      + replay protection is explicit Wave 6 scope and is built together
      with the real provider decision. Test/dev data goes in via
      `ingestInboundMessage` directly (fully real, just not exposed over
      unauthenticated HTTP).
- [x] Tests (12 new, `domain.replies.test.ts`): normalizeFromIdentity,
      rejects empty body/fromIdentity, matched/ambiguous(known-creator-no-
      send)/ambiguous(duplicate-email)/unknown matching, webhook dedupe
      (true no-op, original body preserved), out-of-order/future-dated +
      malformed nested payload ingest safely, unknown-message-id rejected,
      classification overwrite + audit, mailbox sync state round-trip.
      Plus `worker.replyIntelligence.test.ts` (1, real BullMQ, fails
      loudly without an Anthropic key — same pattern as every other
      AI-backed worker test in this build)

### 3.5 UI integration — DONE
- [x] Campaign detail: Sends panel (from 3.3)
- [x] `/replies` reply inbox: real content, match status, "Classify with
      AI" (polled), classification + confidence + limitations + extracted
      facts once run, links to the suggested draft on /approvals
- [x] "Schedule send" wired onto an approved row in /approvals (from 3.3)
- [x] Homepage updated to describe the Wave 3 build and the Mock-provider
      boundary

### 3.6 Regression + commit — done for this checkpoint
- [x] Full test suite (38 files / 212 tests), typecheck, build all clean
- [x] Caught and fixed a real bug via `next build`'s own type checker
      (not caught by root `tsc --noEmit`): `extractedFacts` jsonb needed
      the same `.$type<string[]>()` annotation used elsewhere in
      schema.ts — fixed at the source rather than casting in the
      component
- [x] Commit + push this checkpoint

## Wave 4 — Creator CRM + Whop (detailed checklist) — DONE

### 4.1/4.2 Creator CRM (migration 0010)
- [x] `creator_relationships` (one row per workspace+creator, lazily
      materialized to `'new'` on first read), `creator_notes` (append-
      only), `creator_tasks` (open/done/cancelled, optional campaign
      link), `creator_conversation_summaries` (append-only, AI-derived) —
      all RLS-protected in the exact 0004 shape
- [x] `packages/domain/src/creatorCrm.ts`: relationship get/update
      (partial-update upsert), notes add/list, tasks create/list/status,
      `getCreatorHistory` — reads real `outreach_sends`/`inbound_messages`
      live, **never duplicates them into a CRM table** (mission
      instruction: "reuse existing entities... rather than duplicating")
- [x] `summarize_creator_conversation` AI operation (`packages/ai`) +
      worker processor (`apps/worker/src/processors/
      creatorConversationSummary.ts`) — read-only, grounded strictly in
      the real thread passed in, never fabricates facts; same AI-call-
      lives-in-the-worker layering as every prior wave
- [x] No cross-platform creator-identity merging was built (automatic or
      otherwise) — the product vision's "never auto-merge creator
      identities" constraint is satisfied by not building a merge feature
      at all, not by an extra guard
- [x] Tests: `domain.creatorCrm.test.ts` (12), `worker.
      creatorConversationSummary.test.ts` (1, real BullMQ, fails loudly
      without an Anthropic key — same convention as every AI-backed
      worker test in this build)

### 4.3/4.4 Whop Affiliate/Conversion (migrations 0011–0012)
- [x] `creator_affiliates` (workspace-scoped idempotency key, `pending` →
      `creating` → `active`/`failed`/`unknown`/`revoked`), `creator_
      affiliate_attempts` (append-only, mirrors `outreach_send_attempts`),
      `whop_conversions` (deduped on workspace+provider+event id, exactly
      like `inbound_messages`' webhook dedupe) — all RLS-protected
- [x] `packages/domain/src/whopProvider.ts` + `providers/
      mockWhopProvider.ts`: mirrors `outreachProvider.ts`'s registry
      pattern deliberately (one centralized abstraction, single active
      Mock implementation) — the existing `credential_provider` enum
      already carries a dedicated `whop` slot, the same architectural hook
      the outreach provider decision uses
- [x] `packages/domain/src/creatorAffiliate.ts`: `requestAffiliateCreation`
      is **admin-only** (matches the existing bar for "the action that
      makes an external commitment", same as `decideApproval`) and is the
      one and only code path that can create a `creator_affiliates` row —
      never AI, never automatic, per "AI may never... create affiliates"
- [x] **Interruption safety, proven by test**: an affiliate found already
      `creating` (crash after contacting the provider) is marked `unknown`
      and the provider is never called again — verified with a
      `+mockfail` identity that would expose a blind retry
- [x] `pollWhopConversions`: real polling loop over every `active`
      affiliate against the provider abstraction; reuses the existing
      `provider_mailbox_state` table (workspace+provider+cursor — already
      generic, not reply-specific) instead of a near-duplicate table
- [x] Deliberately did NOT build a public Whop webhook endpoint — Whop
      conversions in V1 are polling-only by design (no signing scheme to
      verify against yet, same reasoning as Wave 3's deferred reply
      webhook); the poll job is the real primary path here, not a backstop
- [x] Tests: `domain.creatorAffiliate.test.ts` (16 — happy path, admin-only
      RBAC, idempotency, unknown/failed outcomes, interruption safety,
      safe no-op re-execution, conversion ingestion + dedupe, real poll
      execution), `worker.creatorAffiliate.test.ts` (1, real BullMQ,
      genuine `active` completion against the Mock provider), `worker.
      whopConversionPoll.test.ts` (1, real BullMQ, honestly reports zero
      conversions rather than fabricating any)

### 4.5 API + UI
- [x] `/api/creators/:id/relationship` (GET/PATCH), `/notes` (GET/POST),
      `/tasks` (GET/POST) + `/tasks/:taskId` (PATCH), `/history` (GET,
      real data), `/summaries` (GET/POST) + `/api/creators/summaries/
      runs/:runId` (poll), `/affiliate` (GET/POST) + `/api/creators/
      affiliates/:affiliateId` (poll the durable row, not a job id — a
      real Whop call may not resolve instantly) + `.../conversions` (GET)
- [x] New `/creators/:id` detail page: relationship status/next-action
      editor, AI summary panel (trigger + poll), real outreach/reply
      history table, notes, tasks, and the Whop affiliate panel (trigger +
      poll + real conversion list) — linked from the `/creators` list

### 4.6 Regression + commit
- [x] Full suite: 43 files / 240 tests passing (212 prior + 28 new); `tsc
      --noEmit` clean; `next build` clean with every new route present
- [x] One self-caught bug fixed before committing: the Mock Whop
      provider's `+mockfail`/`+mockunknown` convention initially checked
      the whole `creatorIdentity` string instead of its local part before
      the `@`, so a real-looking test email never matched — fixed to
      match `mockOutreachProvider.ts`'s exact convention
- [x] Commit + push this checkpoint

## Wave 5 — Analytics (detailed checklist) — DONE

- [x] `packages/domain/src/analytics.ts`: `getWorkspaceAnalytics` (a
      workspace-wide rollup — product, discovery, qualification, matching,
      campaigns, outreach, sends, replies, CRM, Whop affiliate/conversion)
      and `getCampaignAnalytics` (the same principle, scoped to one
      campaign). Every number is a real count read live from stored rows
      inside the request — no caching, no pre-computation, no estimation
- [x] Observed vs. calculated kept explicit: a derived rate (e.g. average
      match score) is always returned alongside its `sampleSize`/`n`, and
      the UI visibly flags a small sample (< 5) rather than presenting it
      with the same confidence as a larger one
- [x] Qualification failure reasons are read from the real per-evaluation
      `measuredValues.reasons` array already persisted by Wave 2's
      `qualifyCampaignCreators` (reused, not recomputed) and tallied into
      a top-10 list
- [x] `creator_qualifications`/`creator_matches` "current" state computed
      with a small `latestPerGroup` helper (max `evaluatedAt`/`computedAt`
      per campaign+creator) — the same append-only-log "latest" pattern
      used everywhere else in this codebase, written once and reused for
      both tables
- [x] Whop conversion revenue is summed **per currency**, never mixed
      across currencies into one misleading total (`revenueByCurrency`,
      an array, not a single number) — only real `order`/`conversion`
      events with a real `amount` are counted, never fabricated
- [x] No predictive ML, no forecasting, nothing speculative anywhere in
      this module
- [x] API: `GET /api/analytics` (workspace-wide), `GET /api/campaigns/:id/
      analytics` (per-campaign)
- [x] UI: new `/analytics` workspace dashboard (every section observed-
      data-only, generation timestamp shown); a compact analytics summary
      line added to the existing campaign detail page, linking to the full
      dashboard
- [x] Tests (3 new, `domain.analytics.test.ts`): a full real fixture
      exercising the entire chain (product → approved intelligence →
      discovery → qualification pass+fail → matching → campaign →
      outreach draft → approval → real send → real reply → CRM
      relationship/note/task → real Whop affiliate → real conversion) and
      asserting every rollup number against what was actually created,
      plus an empty-workspace honesty check (zeroes, not fabricated
      placeholders) and an RBAC check
- [x] Verification: full suite 44 files / 243 tests passing (212+28
      Wave 4, +3 Wave 5); `tsc --noEmit` clean; `next build` clean with
      `/analytics` and both new API routes present
- [x] Commit + push this checkpoint

## External blockers (need the user)

1. **Outreach send provider decision.** No provider selected in the repo.
   Needs: which provider (Gmail via Google Cloud OAuth + Pub/Sub, or a
   transactional API like Resend/SendGrid/Postmark — each has a different
   auth/webhook model), plus the actual account/credentials, which I cannot
   create or authorize myself.
2. **Whop API credentials.** No account/API key configured;
   `integration_credentials` is empty. The full affiliate-creation +
   conversion-polling pipeline (domain, worker, API, UI, tests) is now
   built and genuinely testable against the Mock provider — only the real
   `whop` credential and account authorization are missing.
3. **Google Cloud project + OAuth consent + Pub/Sub topic** — only needed if
   Gmail is the chosen provider (see #1).

Everything else continues automatically without waiting on these.

## Exact next action

Wave 5 is functionally complete (workspace-wide and per-campaign analytics
rollups across every build area, all backed by real stored data, observed
counts kept strictly distinct from derived rates with sample sizes shown —
44 test files / 243 tests passing, clean typecheck + build). Next: begin
Wave 6 (Safety/Operations/Reliability Hardening) — audit the entire V1
implementation against docs/PRODUCT_VISION.md's "security & safety rules
that must never be weakened" (tenancy/RLS, authorization/RBAC, AI
boundaries, outreach safety gate, replies, jobs/retries/interruption
safety, campaign pause/kill-switch, auditability), with particular focus
on the two things explicitly deferred here: real webhook signature
verification + replay protection (paired with whichever provider decision
eventually lands) and a general pass over queue/job dead-letter and stuck-
job handling across all lanes. Fix any real issue found; never weaken a
safety rule or test to make it pass.
