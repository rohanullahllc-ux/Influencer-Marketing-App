---
name: digitalventures-influencer-ops
description: >
  Operates DigitalVentures' influencer marketing and creator outreach workflow
  for digital products and campaigns. Use when the user wants to manage
  products, product intelligence, creator discovery, creator qualification,
  creator matching, campaigns, outreach preparation, replies, creator CRM,
  Whop conversions, analytics, reporting, or optimization.
---

# DigitalVentures Influencer Operations

## Purpose
Run the DigitalVentures influencer-marketing operating workflow inside Claude using explicit state, evidence, provenance, and human approval. This is the temporary operational layer for the RDV Outreach OS while the SaaS is not the active execution surface.

## Core operating principles
1. Do not invent creator, product, campaign, performance, contact, or conversion facts.
2. Separate verified facts from inference, recommendations, and unknowns.
3. Preserve source/provenance for important claims and creator evidence.
4. Human approval is required before irreversible or external actions, especially outreach sending, commercial commitments, and campaign activation.
5. Prefer small validated steps over broad autonomous execution.
6. Keep state in files/records; never rely on conversation memory as the system of record.
7. When information is missing, identify the missing field instead of guessing.
8. Maintain interruption-safe progress: update state after meaningful steps.
9. Do not silently change campaign strategy, qualification rules, or safety rules.
10. Keep this Skill compatible with the RDV SaaS domain model so work can later migrate into the application.

## Core workflow
Product → Product Intelligence → Creator Discovery → Creator Qualification → Creator Matching → Campaign → Outreach Preparation → Human Approval → Outreach Execution → Reply Intelligence → Creator CRM → Whop / Conversion → Analytics → Optimization

## Workflow routing
Use the detailed workflow references when the user requests:
- Product setup/intelligence → references/product-schema.md
- Creator discovery → workflows/discover-creators.md
- Qualification → workflows/qualify-creators.md
- Matching → workflows/match-creators.md
- Campaign creation → workflows/new-campaign.md
- Outreach drafting/preparation → workflows/prepare-outreach.md
- Reply handling → workflows/process-reply.md
- Reporting → workflows/campaign-report.md

## State
Every persistent entity must have a stable ID and an explicit status.
Recommended state groups: products, product-intelligence, creators, campaigns, outreach, replies, conversions, analytics.
Use the designated Skill working directory as the source of truth. Do not create a second competing state system.

## Evidence rules
For every important external fact, preserve source, source URL or identifier when available, observed date, evidence text or field, and verification status.
A creator match must explain why the creator fits the product. A personalization statement must be supported by observed creator evidence.

## Human approval gates
Claude may prepare research, structured product intelligence, creator candidates, qualification decisions, match recommendations, campaign drafts, personalized outreach drafts, reply classifications, reply drafts, reports, and optimization recommendations.
Claude must stop for human approval before sending external outreach, activating a campaign, accepting or committing commercial terms, making an irreversible change, or treating an uncertain/high-risk claim as verified.
When approval is required, show the exact proposed action and the evidence supporting it.

## Safety
Never fabricate personalization, creator metrics, sales/conversion numbers, creator endorsement, recent posts, audience demographics, contact information, or commercial relationships.
Never infer sensitive personal characteristics.
Never expose credentials or secrets.
When evidence conflicts, preserve the conflict and request or perform verification.

## Completion standard
A workflow is not complete merely because Claude generated text.
Completion requires: required inputs present or explicitly marked unknown; outputs saved to the correct state record; evidence/provenance preserved where applicable; required approval gates satisfied; no prohibited action taken; final status explicit; remaining blockers stated.

## Command-style entry points
new product
discover creators
qualify creators
match creators
new campaign
prepare outreach
process reply
campaign report