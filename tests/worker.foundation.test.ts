import { describe, it, expect, afterAll } from "vitest";
import { Worker } from "bullmq";
import { QUEUE_LANES, getQueue, getRedisConnection, closeAllQueues, closeRedisConnection } from "@rdv/queue";

// Importing the worker app's own registry + processor module (not
// spawning the real process, which has top-level side effects/signal
// handlers unsuited to a test) to prove the actual registered handler —
// not a re-implementation of it — is what runs.
import { getJobProcessor } from "../apps/worker/src/registry.js";
import "../apps/worker/src/processors/foundationSmoke.js";

describe("Worker — Wave 1 foundation smoke test end-to-end", () => {
  afterAll(async () => {
    await closeAllQueues();
    await closeRedisConnection();
  });

  it("a real BullMQ worker processes a real job through the real registered handler", async () => {
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
      const job = await queue.add("foundation_smoke_test", { echo: "wave-1" });

      const result = await new Promise((resolve, reject) => {
        worker.on("completed", (completedJob, returnValue) => {
          if (completedJob.id === job.id) resolve(returnValue);
        });
        worker.on("failed", (failedJob, err) => {
          if (failedJob?.id === job.id) reject(err);
        });
        setTimeout(() => reject(new Error("timed out waiting for job completion")), 8000);
      });

      expect(result).toMatchObject({ ok: true, echo: "wave-1" });
    } finally {
      await worker.close();
    }
  }, 15000);

  it("an unrecognized job name fails loudly instead of silently succeeding", async () => {
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
      const job = await queue.add("totally_unregistered_job_type", {}, { attempts: 1 });

      const failure = await new Promise((resolve, reject) => {
        worker.on("failed", (failedJob, err) => {
          if (failedJob?.id === job.id) resolve(err);
        });
        worker.on("completed", (completedJob) => {
          if (completedJob.id === job.id) reject(new Error("job unexpectedly completed"));
        });
        setTimeout(() => reject(new Error("timed out waiting for job failure")), 8000);
      });

      expect((failure as Error).message).toMatch(/No processor for/);
    } finally {
      await worker.close();
    }
  }, 15000);
});
