import { describe, it, expect, afterAll } from "vitest";
import { Worker } from "bullmq";
import { QUEUE_LANES, getQueue, getRedisConnection, closeAllQueues, closeRedisConnection } from "@rdv/queue";
import { createProduct } from "@rdv/domain";
import { createWorkspaceWithOwner, getUserByEmail } from "@rdv/auth";
import { resetDb } from "./helpers.js";

// Importing the worker app's own registry + processor module (not
// spawning the real process), mirroring tests/worker.foundation.test.ts —
// proves the actual registered `ai_analyze_product` handler runs, not a
// re-implementation of it.
import { getJobProcessor } from "../apps/worker/src/registry.js";
import "../apps/worker/src/processors/analyzeProduct.js";

/**
 * Wave 2 Phase 2 (plan §7): the full real pipeline (queue -> worker ->
 * registry -> @rdv/domain -> @rdv/ai) for `ai_analyze_product`, run
 * through a real BullMQ worker against real local Redis + Postgres. No
 * DeepSeek key is configured in this environment, so the job is
 * expected to fail loudly with a clear reason — proving the pipeline
 * wires together correctly end-to-end without needing a live network
 * call to DeepSeek (matches Phase 0's "code path fully built, real
 * calls need a real key" design).
 */
describe("Worker — ai_analyze_product (Wave 2 Phase 2)", () => {
  afterAll(async () => {
    await closeAllQueues();
    await closeRedisConnection();
  });

  it("runs the real registered handler end-to-end and fails loudly without a configured DeepSeek key", async () => {
    await resetDb();
    const ws = await createWorkspaceWithOwner({ workspaceName: "Worker AI WS", ownerEmail: "worker-ai-owner@test.local" });
    const ownerId = (await getUserByEmail("worker-ai-owner@test.local")).id;
    const product = await createProduct({ workspaceId: ws.id, actorUserId: ownerId, name: "Worker Test Product" });

    const lane = QUEUE_LANES.aiOps;
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
        "ai_analyze_product",
        { workspaceId: ws.id, actorUserId: ownerId, productId: product.id },
        { attempts: 1 }
      );

      const failure = await new Promise((resolve, reject) => {
        worker.on("failed", (failedJob, err) => {
          if (failedJob?.id === job.id) resolve(err);
        });
        worker.on("completed", (completedJob) => {
          if (completedJob.id === job.id) reject(new Error("job unexpectedly completed with no DeepSeek key configured"));
        });
        setTimeout(() => reject(new Error("timed out waiting for job failure")), 8000);
      });

      expect((failure as Error).message).toMatch(/No DeepSeek API key configured/);

      // Failed jobs are kept by design (removeOnFail: false, see
      // packages/queue/src/queues.ts) — remove this real, shared-Redis
      // job explicitly so it doesn't linger and pollute other tests'
      // view of the ai-ops lane (mirrors tests/queue.lanes.test.ts's own
      // convention).
      await job.remove();
    } finally {
      await worker.close();
    }
  }, 15000);
});
