import { and, eq } from "drizzle-orm";
import { withWorkspace, writeAuditLog, schema } from "@rdv/db";
import { requireRole } from "@rdv/auth";
import { getQueue, QUEUE_LANES } from "@rdv/queue";
import { NotFoundError, ValidationError, oneOrThrow } from "@rdv/lib";
import type { ProductIntelligence } from "./entities.js";

const { productIntelligence, products, workspaceMembers } = schema;

/**
 * Data an AI-generated draft carries (plan §14.2's list fields, all
 * arrays of strings, plus a rationale and a confidence score). Validated
 * against a strict schema by the `analyze_product` AI operation itself
 * (packages/ai/src/operations/analyzeProduct.ts) before this module ever
 * sees it — this module trusts its caller's shape but never trusts an
 * AI operation's raw, unvalidated output.
 */
export interface GeneratedIntelligenceData {
  idealCustomer: string[];
  problems: string[];
  benefits: string[];
  niches: string[];
  subNiches: string[];
  creatorTypes: string[];
  countries: string[];
  languages: string[];
  topics: string[];
  keywords: string[];
  audienceRationale: string;
  confidence: number;
}

const EDITABLE_FIELDS: (keyof GeneratedIntelligenceData)[] = [
  "idealCustomer",
  "problems",
  "benefits",
  "niches",
  "subNiches",
  "creatorTypes",
  "countries",
  "languages",
  "topics",
  "keywords",
  "audienceRationale",
  "confidence",
];

/**
 * Enqueues async AI generation (plan §7: "triggers AI draft, async" — a
 * slow model call must never block the request thread). The actual
 * `product_intelligence` row is inserted later, by the worker's
 * `ai_analyze_product` job processor calling `persistGeneratedIntelligence`
 * below — never synchronously here.
 */
export async function requestProductIntelligenceGeneration(params: {
  workspaceId: string;
  actorUserId: string;
  productId: string;
}): Promise<{ jobId: string }> {
  const { workspaceId, actorUserId, productId } = params;

  await withWorkspace(workspaceId, async (tx) => {
    const [actorMembership] = await tx.select().from(workspaceMembers).where(eq(workspaceMembers.userId, actorUserId));
    requireRole(actorMembership?.role, "member_operator");

    const [product] = await tx.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!product) throw new NotFoundError(`No product with id ${productId}`);
  });

  const job = await getQueue(QUEUE_LANES.aiOps).add("ai_analyze_product", { workspaceId, actorUserId, productId });
  if (!job.id) throw new Error("ai_analyze_product job was enqueued without an id");
  return { jobId: job.id };
}

/**
 * Called only by the worker's `ai_analyze_product` job processor. Always
 * inserts a new row as a `draft` with `origin: "ai_derived"` — never
 * updates an existing row, and never sets `status` to anything but
 * `draft` (approval is a distinct, later, human action; see
 * `approveProductIntelligence` below). No `actorUserId` on the audit
 * entry: this is a system/AI-triggered write, not a direct human action.
 */
export async function persistGeneratedIntelligence(params: {
  workspaceId: string;
  productId: string;
  data: GeneratedIntelligenceData;
}): Promise<ProductIntelligence> {
  const { workspaceId, productId, data } = params;

  return withWorkspace(workspaceId, async (tx) => {
    const [product] = await tx.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!product) throw new NotFoundError(`No product with id ${productId}`);

    const row = oneOrThrow(
      await tx
        .insert(productIntelligence)
        .values({
          workspaceId,
          productId,
          origin: "ai_derived",
          status: "draft",
          idealCustomer: data.idealCustomer,
          problems: data.problems,
          benefits: data.benefits,
          niches: data.niches,
          subNiches: data.subNiches,
          creatorTypes: data.creatorTypes,
          countries: data.countries,
          languages: data.languages,
          topics: data.topics,
          keywords: data.keywords,
          audienceRationale: data.audienceRationale,
          confidence: String(data.confidence),
        })
        .returning(),
      "insert product_intelligence"
    );

    await writeAuditLog(tx, {
      workspaceId,
      actorUserId: null,
      action: "product_intelligence.generated",
      entityType: "product_intelligence",
      entityId: row.id,
      metadata: { productId },
    });

    return row;
  });
}

export async function listProductIntelligenceVersions(params: {
  workspaceId: string;
  actorUserId: string;
  productId: string;
}): Promise<ProductIntelligence[]> {
  const { workspaceId, actorUserId, productId } = params;
  return withWorkspace(workspaceId, async (tx) => {
    const [actorMembership] = await tx.select().from(workspaceMembers).where(eq(workspaceMembers.userId, actorUserId));
    requireRole(actorMembership?.role, "member_operator");

    return tx.select().from(productIntelligence).where(eq(productIntelligence.productId, productId));
  });
}

export async function getApprovedProductIntelligence(params: {
  workspaceId: string;
  productId: string;
}): Promise<ProductIntelligence | null> {
  const { workspaceId, productId } = params;
  return withWorkspace(workspaceId, async (tx) => {
    // The partial unique index (migration 0006) guarantees at most one
    // row matches — reading it back is a plain equality query, not a
    // scan-and-filter.
    const [row] = await tx
      .select()
      .from(productIntelligence)
      .where(and(eq(productIntelligence.productId, productId), eq(productIntelligence.status, "approved")))
      .limit(1);
    return row ?? null;
  });
}

/**
 * Human edit of a draft (plan §7/§14.2: edited_by/edited_at are recorded
 * distinctly from the original AI generation — origin/status/approved_*
 * are never touched here). Only a `draft` version may be edited: an
 * `approved` or `superseded` version is a fixed historical record, per
 * the same content-pinning principle used elsewhere in the plan (§11) —
 * editing it would silently change what was actually approved.
 */
export async function editProductIntelligence(params: {
  workspaceId: string;
  actorUserId: string;
  intelligenceId: string;
  patch: Partial<GeneratedIntelligenceData>;
}): Promise<ProductIntelligence> {
  const { workspaceId, actorUserId, intelligenceId, patch } = params;

  const fields = Object.keys(patch);
  if (fields.length === 0) {
    throw new ValidationError("patch must include at least one field to edit");
  }
  for (const field of fields) {
    if (!EDITABLE_FIELDS.includes(field as keyof GeneratedIntelligenceData)) {
      throw new ValidationError(`"${field}" is not an editable product_intelligence field`);
    }
  }

  return withWorkspace(workspaceId, async (tx) => {
    const [actorMembership] = await tx.select().from(workspaceMembers).where(eq(workspaceMembers.userId, actorUserId));
    requireRole(actorMembership?.role, "member_operator");

    const [existing] = await tx.select().from(productIntelligence).where(eq(productIntelligence.id, intelligenceId)).limit(1);
    if (!existing) throw new NotFoundError(`No product_intelligence with id ${intelligenceId}`);
    if (existing.status !== "draft") {
      throw new ValidationError(
        `Only a draft version can be edited (this version is "${existing.status}") — approved/superseded versions are a fixed historical record`
      );
    }

    const dbPatch: Record<string, unknown> = { editedBy: actorUserId, editedAt: new Date() };
    if (patch.idealCustomer !== undefined) dbPatch.idealCustomer = patch.idealCustomer;
    if (patch.problems !== undefined) dbPatch.problems = patch.problems;
    if (patch.benefits !== undefined) dbPatch.benefits = patch.benefits;
    if (patch.niches !== undefined) dbPatch.niches = patch.niches;
    if (patch.subNiches !== undefined) dbPatch.subNiches = patch.subNiches;
    if (patch.creatorTypes !== undefined) dbPatch.creatorTypes = patch.creatorTypes;
    if (patch.countries !== undefined) dbPatch.countries = patch.countries;
    if (patch.languages !== undefined) dbPatch.languages = patch.languages;
    if (patch.topics !== undefined) dbPatch.topics = patch.topics;
    if (patch.keywords !== undefined) dbPatch.keywords = patch.keywords;
    if (patch.audienceRationale !== undefined) dbPatch.audienceRationale = patch.audienceRationale;
    if (patch.confidence !== undefined) dbPatch.confidence = String(patch.confidence);

    const updated = oneOrThrow(
      await tx.update(productIntelligence).set(dbPatch).where(eq(productIntelligence.id, intelligenceId)).returning(),
      "update product_intelligence"
    );

    await writeAuditLog(tx, {
      workspaceId,
      actorUserId,
      action: "product_intelligence.edited",
      entityType: "product_intelligence",
      entityId: updated.id,
      metadata: { fields },
    });

    return updated;
  });
}

/**
 * The approve transaction from plan §14.2, verbatim: (1) supersede
 * whichever version is currently approved for this product, if any;
 * (2) approve the target version. Both writes happen in the same
 * transaction as the partial unique index (migration 0006), so there is
 * no window where two versions are simultaneously "approved". Requires
 * Admin (plan §7's RBAC table) — a higher bar than create/edit's
 * Member-Operator, since approval is what makes a version authoritative
 * for every later phase.
 */
export async function approveProductIntelligence(params: {
  workspaceId: string;
  actorUserId: string;
  intelligenceId: string;
}): Promise<ProductIntelligence> {
  const { workspaceId, actorUserId, intelligenceId } = params;

  return withWorkspace(workspaceId, async (tx) => {
    const [actorMembership] = await tx.select().from(workspaceMembers).where(eq(workspaceMembers.userId, actorUserId));
    requireRole(actorMembership?.role, "admin");

    const [target] = await tx.select().from(productIntelligence).where(eq(productIntelligence.id, intelligenceId)).limit(1);
    if (!target) throw new NotFoundError(`No product_intelligence with id ${intelligenceId}`);
    if (target.status === "approved") {
      throw new ValidationError("This version is already approved");
    }
    if (target.status === "superseded") {
      throw new ValidationError("A superseded version cannot be re-approved");
    }

    const versions = await tx
      .select()
      .from(productIntelligence)
      .where(eq(productIntelligence.productId, target.productId));
    const currentlyApproved = versions.find((v) => v.status === "approved" && v.id !== target.id);

    if (currentlyApproved) {
      await tx
        .update(productIntelligence)
        .set({ status: "superseded" })
        .where(eq(productIntelligence.id, currentlyApproved.id));
    }

    const now = new Date();
    const approved = oneOrThrow(
      await tx
        .update(productIntelligence)
        .set({ status: "approved", approvedBy: actorUserId, approvedAt: now })
        .where(eq(productIntelligence.id, intelligenceId))
        .returning(),
      "approve product_intelligence"
    );

    await writeAuditLog(tx, {
      workspaceId,
      actorUserId,
      action: "product_intelligence.approved",
      entityType: "product_intelligence",
      entityId: approved.id,
      metadata: { productId: target.productId, previouslyApprovedId: currentlyApproved?.id ?? null },
    });

    return approved;
  });
}
