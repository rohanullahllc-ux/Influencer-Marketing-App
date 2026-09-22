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
- Wave 3 (Live Outreach + Reply Intelligence): **in progress**
- Wave 4 (Creator CRM + Whop): not started
- Wave 5 (Analytics): not started
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

## External blockers (need the user)

1. **Outreach send provider decision.** No provider selected in the repo.
   Needs: which provider (Gmail via Google Cloud OAuth + Pub/Sub, or a
   transactional API like Resend/SendGrid/Postmark — each has a different
   auth/webhook model), plus the actual account/credentials, which I cannot
   create or authorize myself.
2. **Whop API credentials** (Wave 4) — no account/API key configured;
   `integration_credentials` is empty.
3. **Google Cloud project + OAuth consent + Pub/Sub topic** — only needed if
   Gmail is the chosen provider (see #1).

Everything else continues automatically without waiting on these.

## Exact next action

Wave 3 is functionally complete (schema, Mock provider, real send
execution with a genuinely tested interruption-safety property, reply
ingestion/matching/classification/suggested-response, all wired into real
UI, 38 test files / 212 tests passing, clean typecheck + build). Next:
begin Wave 4 (Creator CRM + Whop) — CRM data model (relationship status,
history, notes, tasks, next action, AI conversation summaries — reusing
inbound_messages/outreach_sends as the history source rather than
duplicating it), then the Whop affiliate/conversion adapter (human-
triggered creation, polling-based conversion tracking) built the same way
Wave 3's outreach provider was: a real, complete, testable implementation
against a Mock/integration-test path, stopping only at the real Whop
account/API-key boundary.
