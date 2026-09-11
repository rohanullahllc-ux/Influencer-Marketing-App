# Influencer Marketing Campaign & Outreach Operating System

Internal operating system for **Rohan Digital Ventures (RDV)** to run its own influencer marketing operations — built so the architecture can later evolve into a commercial SaaS, without needing a rebuild to get there.

## What this is

A product-aware system that starts from a digital product, understands what it is and who it's for, discovers creators whose audience and content are genuinely relevant, qualifies and ranks them, helps build campaigns, prepares personalized outreach, safely sends it under human approval, manages replies and relationships, connects Whop affiliate partnerships, and measures results.

This is **not** a generic influencer database. The defining idea: start with the product, then find creators who actually fit it — not just creators who clear a follower-count threshold.

## Core business workflow

```
Product
  → Product Intelligence (AI-derived, human-approved)
  → Creator Discovery (YouTube API-first, + legitimate manual entry)
  → Creator Qualification (deterministic rules)
  → Creator Matching (AI score + human-readable explanation)
  → Campaign
  → Personalized Email Outreach
  → Human Approval
  → Timezone-Aware Scheduling
  → Safe Send
  → Reply Intelligence
  → Human Relationship Management
  → Whop Affiliate / Conversion (human-triggered)
  → Observed Analytics
```

## Strategic differentiator

Qualification (follower range, average views, geography, language, platform, status) is deterministic. Matching (niche fit, content relevance, audience relevance, product fit) is AI-assisted and always comes with an explanation, never a bare score. A creator can clear every deterministic threshold and still be a poor recommendation if the audience isn't actually relevant — the system is designed to catch that.

## Human control principle

**AI assists. Humans remain responsible for externally consequential decisions.**

AI may: analyze, classify, recommend, summarize, draft, personalize.
AI may never: approve or send messages, create affiliates, merge creator identities, activate campaigns, disable suppression, or change permissions.

## V1 scope boundaries

**In scope:**
- Product intelligence (AI-analyzed, human-reviewed and edited)
- YouTube-first automated creator discovery via the official API, plus legitimate manual creator entry (including Instagram as enrichment data)
- Deterministic qualification + AI-assisted matching with explanations
- Campaign manager with multi-template assignment (simple segment-based, not full A/B testing)
- Personalized outreach generation with mandatory per-message human approval
- A founder-facing Approval Queue (individual-message based, content-pinned — edits invalidate prior approval)
- Centralized execution-time outbound safety gate (kill switch, suppression, approval validity, sending limits, first-send cap, cross-campaign safeguard, idempotency, schedule validity)
- Atomic send idempotency keyed to Campaign + Creator + Outreach Step, with an explicit UNKNOWN/AMBIGUOUS send state (never assume a failed job means a failed send)
- Cross-campaign contact safeguard with logged human override
- Timezone-aware scheduling (recipient timezone when known, else workspace default — never naive UTC)
- Reply intelligence: Interested / Not Interested / Needs Human Review
- Founder notifications for meaningful events (in-app + email)
- Creator CRM: lifecycle, relationship status, history, notes, tasks, AI conversation summaries
- Human-triggered Whop affiliate creation and polling-based conversion tracking
- Observed analytics (raw data and derived rates kept distinct)
- SaaS-shaped foundations: workspace/tenant model, RLS-backed isolation, auth, RBAC, encrypted credentials, audit logging — without commercial activation

**Explicitly out of V1** (deferred, not accidental gaps):
- Instagram cold-DM automation, messaging automation, scraping, browser automation, or unofficial/private API workarounds
- Automatic cross-platform identity merging (cross-platform links are always proposed, human-confirmed, reversible)
- Public customer signup, Stripe billing, commercial plans
- Predictive ML, forecasting, advanced attribution, AI-generated campaign-learning narratives
- Microservices, a generic multi-vendor AI provider abstraction, event sourcing, a general event bus, workflow-engine platforms
- Full template version history, creator metric time-series history, advanced A/B testing, creator similarity search

## Architecture (locked)

- **Application:** Next.js + React + TypeScript, modular monolith
- **Processes:** two from one codebase — a web/API process and a long-running worker process
- **Database:** PostgreSQL as source of truth, with Row-Level Security; application-layer authorization on top
- **Queue/cache:** Redis + BullMQ, lanes separated by external dependency / rate-limit profile (YouTube/discovery, outreach provider, Whop polling, webhook/event processing, AI operations, plus a general/internal lane where useful) — not one queue per business concept
- **AI:** one centralized AI Orchestration module, accessed through business-level operations (analyze product, classify creator relevance, explain a match, personalize a message, classify a reply, summarize a conversation) — never a generic provider abstraction, and never an authorization layer
- **Data provenance:** every fact is tagged verified/external, human-entered, AI-derived, or estimated; AI-derived data never silently overwrites verified data
- **Suppression/DNC:** durable, workspace-scoped, keyed to normalized contact identity (survives creator merges/re-imports), enforced at execution time
- **Events:** webhook-primary with reconciliation polling as backstop; signature verification, replay protection, event IDs, append-only history, out-of-order tolerance

## Failure philosophy

Prefer safe interruption over unsafe continuation. Ambiguous situations (an uncertain send, an uncertain identity match, malformed AI output, uncertain external state) are parked for human resolution rather than guessed through.

## Build plan

Step 5 defines twelve build areas (Foundation; Product Intelligence; Creator Intelligence & Discovery; Creator Qualification & Matching; Campaign Manager; Outreach; Reply Intelligence; Creator CRM; Whop Affiliate/Conversion; Analytics; Safety, Operations & Reliability; End-to-End V1 Test). Step 6 executes them across seven waves, each gated on build → test → fix → re-test → accept before the next begins:

1. **Foundation**
2. **Core Product + Safety Core** — Track A (Product + Creator + Campaign) and Track B (Outreach Safety Core in dry-run/simulation) in parallel
3. **Live Outreach + Reply Intelligence**
4. **Creator CRM + Whop**
5. **Analytics**
6. **Safety / Operations / Reliability Hardening**
7. **Complete End-to-End V1 Validation**

The first working vertical slice targets: Product → Approved Product Intelligence → narrow real YouTube discovery → Qualification → Matching → Explained shortlist → Campaign draft → Personalized outreach → Approval Queue → human approval → dry-run simulated send → duplicate-send block → suppression block. No live outreach-provider mailbox required for this slice.

## Current status

- Steps 1–5 (product definition, feature inventory, V1 scope, architecture, detailed build plan): **locked**
- Step 6 (implementation): **in progress** — Wave 1 foundation work is being brought into this repository; Wave 2 (Core Product + Safety Core) has not started

## Security & safety rules that must never be weakened

Never bypass tenant isolation, RLS, human approval, DNC/suppression, or the safety gate. Never auto-send an ambiguous message. Never treat a failed background job as proof a send failed. Never silently override a campaign pause or auto-increase sending volume. Never auto-merge cross-platform creator identities. Never let AI authorize outbound behavior or create affiliates. Never use scraping to compensate for missing official API access.
