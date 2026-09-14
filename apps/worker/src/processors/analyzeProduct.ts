import { QUEUE_LANES } from "@rdv/queue";
import { runAiOperation } from "@rdv/ai";
import type { AnalyzeProductInput, AnalyzeProductOutput } from "@rdv/ai";
import { getProduct, persistGeneratedIntelligence, type GeneratedIntelligenceData } from "@rdv/domain";
import { registerJobProcessor } from "../registry.js";

/**
 * Wave 2 Phase 2 (plan §7): the `ai-ops` job that generates Product
 * Intelligence asynchronously, so a slow model call never blocks the
 * request thread that triggered it (`requestProductIntelligenceGeneration`
 * in packages/domain — enqueues this job and returns immediately).
 */
export interface AnalyzeProductJobData {
  workspaceId: string;
  actorUserId: string;
  productId: string;
}

registerJobProcessor<AnalyzeProductJobData, { intelligenceId: string }>(
  QUEUE_LANES.aiOps,
  "ai_analyze_product",
  async (data) => {
    const { workspaceId, actorUserId, productId } = data;

    const product = await getProduct({ workspaceId, actorUserId, productId });

    const result = await runAiOperation<AnalyzeProductInput, AnalyzeProductOutput>(
      "analyze_product",
      { workspaceId, productName: product.name, productDescription: product.description },
      { workspaceId, actorUserId }
    );

    const saved = await persistGeneratedIntelligence({
      workspaceId,
      productId,
      data: result.data as GeneratedIntelligenceData,
    });

    return { intelligenceId: saved.id };
  }
);
