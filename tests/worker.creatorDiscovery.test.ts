import { describe, it, expect, afterAll } from "vitest";
import { Worker } from "bullmq";
import { QUEUE_LANES, getQueue, getRedisConnection, closeAllQueues, closeRedisConnection } from "@rdv/queue";
import {
  createProduct,
  persistGeneratedIntelligence,
  approveProductIntelligence,
  type GeneratedIntelligenceData,
} from "@rdv/domain";
import { createWorkspaceWithOwner, getUserByEmail } from "@rdv/auth";
import { resetDb } from "./helpers.js";

// Importing the worker app's own registry + processor module (not
// spawning the real process), mirroring tests/worker.analyzeProduct.test.ts.
import { getJobProcessor } from "../apps/worker/src/registry.js";
import "../apps/worker/src/processors/creatorDiscovery.js";

const SAMPLE_INTELLIGENCE: GeneratedIntelligenceData = {
  idealCustomer: ["busy parents"],
  problems: ["no time to cook"],
  benefits: ["saves time"],
  niches: ["food"],
  subNiches: ["meal kits"],
  creatorTypes: ["lifestyle vloggers"],
  countries: ["US"],
  languages: ["en"],
  topics: ["cooking"],
  keywords: ["meal kit", "dinner"],
  audienceRationale: "Parents short on time value convenience.",
  confidence: 0.8,
};

/**
 * Wave 2 Phase 3 (plan §8): the full real pipeline (queue -> worker ->
 * registry -> @rdv/domain) for `youtube_discovery_search`, run through a
 * real BullMQ worker against real local Redis + Postgres. No YouTube key
 * is configured in this environment, so the job is expected to fail
 * loudly with a clear reason — proving the pipeline wires together
 * correctly end-to-end without a live network call to YouTube.
 */
describe("Worker — youtube_discovery_search (Wave 2 Phase 3)", () => {
  afterAll(async () => {
    await closeAllQueues();
    await closeRedisConnection();
  });

  it("runs the real registered handler end-to-end and fails loudly without a configured YouTube key", async () => {
    await resetDb();
    const ws = await createWorkspaceWithOwner({ workspaceName: "Worker Discovery WS", ownerEmail: "worker-discovery-owner@test.local" });
    const ownerId = (await getUserByEmail("worker-discovery-owner@test.local")).id;
    const product = await createProduct({ workspaceId: ws.id, actorUserId: ownerId, name: "Worker Discovery Product" });
    const draft = await persistGeneratedIntelligence({ workspaceId: ws.id, productId: product.id, data: SAMPLE_INTELLIGENCE });
    await approveProductIntelligence({ workspaceId: ws.id, actorUserId: ownerId, intelligenceId: draft.id });

    const lane = QUEUE_LANES.creatorDiscovery;
    const queue = getQueue(lane);

    const worker = new Worker(
      lane,
      async (job) => {
        const handler = getJobProcessor(lane, job.name);
        if (!handler) throw new Error(`No processor for ${job.name}`);
        return handler(job.data, job);
      },
      { connection: getRedisConnection() }
    );

    try {
      const job = await queue.add(
        "youtube_discovery_search",
        { workspaceId: ws.id, actorUserId: ownerId, productId: product.id, query: "meal kit recipes", maxResults: 5 },
        { attempts: 1 }
      );

      const failure = await new Promise((resolve, reject) => {
        worker.on("failed", (failedJob, err) => {
          if (failedJob?.id === job.id) resolve(err);
        });
        worker.on("completed", (completedJob) => {
          if (completedJob.id === job.id) reject(new Error("job unexpectedly completed with no YouTube key configured"));
        });
        setTimeout(() => reject(new Error("timed out waiting for job failure")), 8000);
      });

      expect((failure as Error).message).toMatch(/No YouTube API key configured/);

      // Failed jobs are kept by design (removeOnFail: false) — remove
      // this real, shared-Redis job so it doesn't linger and pollute
      // other tests' view of the creator-discovery lane.
      await job.remove();
    } finally {
      await worker.close();
    }
  }, 15000);
});
