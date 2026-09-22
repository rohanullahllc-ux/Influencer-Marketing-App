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

### 3.4 Reply intelligence — next

### 3.4 Reply intelligence
- [ ] `packages/domain/src/replies.ts`: persist inbound message, match to
      creator/campaign/outreach by recipient identity, `ambiguous`/`unknown`
      → needs_human_review, dedupe by (workspace, provider,
      provider_message_id)
- [ ] `packages/ai/src/operations/classifyReply.ts`: Interested / Not
      Interested / Needs Human Review + confidence + limitations; separate
      operation drafts a suggested response (never auto-sent — becomes a
      normal `outreach_drafts` row that goes through the *same* approval +
      safety-gate + send pipeline, reusing existing infrastructure rather
      than inventing a parallel reply-send path)
- [ ] Worker job for webhook-style ingestion (against the Mock provider) +
      a reconciliation-polling job stub (proves the backstop logic works
      even though there is no real mailbox to poll yet)
- [ ] Tests: duplicate webhook, out-of-order, malformed payload, unknown
      creator, ambiguous match

### 3.5 UI integration
- [ ] Campaign detail: schedule/send panel, send history/status
- [ ] Reply inbox screen: classification, suggested response review

### 3.6 Regression + commit
- [ ] Full test suite, typecheck, build
- [ ] Commit checkpoint(s), push to `claude/rdv-project-context-3ckcrw`

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

Writing migration `0007_wave3_outreach_send_and_reply.sql` + `schema.ts`
mirror, then the Mock provider, then send-execution domain/worker/tests.
