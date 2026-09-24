import type { InferSelectModel } from "drizzle-orm";
import {
  products,
  productIntelligence,
  creators,
  campaigns,
  campaignCreators,
  outreachTemplates,
  campaignTemplates,
  creatorQualifications,
  creatorMatches,
  outreachDrafts,
  approvals,
  suppressions,
  dryRunEvaluations,
  dryRunEvaluationResults,
  outreachSends,
  outreachSendAttempts,
  inboundMessages,
  providerMailboxState,
  creatorRelationships,
  creatorNotes,
  creatorTasks,
  creatorConversationSummaries,
  creatorAffiliates,
  creatorAffiliateAttempts,
  whopConversions,
} from "@rdv/db";

/**
 * Wave 2 Phase 1 (revised plan §6): entity types only, inferred directly
 * from the Drizzle schema in @rdv/db (the single source of truth for
 * table shape) so this package can never drift from the actual DB rows.
 * No business logic lives here yet — qualification scoring, safety-gate
 * evaluation, content-hash computation, etc. are added by each entity's
 * own later phase (Phase 2 onward), per the Phase 1 acceptance criteria:
 * "no business logic beyond what's needed to compile."
 */

export type Product = InferSelectModel<typeof products>;
export type ProductIntelligence = InferSelectModel<typeof productIntelligence>;
export type Creator = InferSelectModel<typeof creators>;
export type Campaign = InferSelectModel<typeof campaigns>;
export type CampaignCreator = InferSelectModel<typeof campaignCreators>;
export type OutreachTemplate = InferSelectModel<typeof outreachTemplates>;
export type CampaignTemplate = InferSelectModel<typeof campaignTemplates>;
export type CreatorQualification = InferSelectModel<typeof creatorQualifications>;
export type CreatorMatch = InferSelectModel<typeof creatorMatches>;
export type OutreachDraft = InferSelectModel<typeof outreachDrafts>;
export type Approval = InferSelectModel<typeof approvals>;
export type Suppression = InferSelectModel<typeof suppressions>;
export type DryRunEvaluation = InferSelectModel<typeof dryRunEvaluations>;
export type DryRunEvaluationResult = InferSelectModel<typeof dryRunEvaluationResults>;
export type OutreachSend = InferSelectModel<typeof outreachSends>;
export type OutreachSendAttempt = InferSelectModel<typeof outreachSendAttempts>;
export type InboundMessage = InferSelectModel<typeof inboundMessages>;
export type ProviderMailboxState = InferSelectModel<typeof providerMailboxState>;
export type CreatorRelationship = InferSelectModel<typeof creatorRelationships>;
export type CreatorNote = InferSelectModel<typeof creatorNotes>;
export type CreatorTask = InferSelectModel<typeof creatorTasks>;
export type CreatorConversationSummary = InferSelectModel<typeof creatorConversationSummaries>;
export type CreatorAffiliate = InferSelectModel<typeof creatorAffiliates>;
export type CreatorAffiliateAttempt = InferSelectModel<typeof creatorAffiliateAttempts>;
export type WhopConversion = InferSelectModel<typeof whopConversions>;
