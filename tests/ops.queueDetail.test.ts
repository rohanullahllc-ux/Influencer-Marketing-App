import { describe, it, expect, afterAll, afterEach } from "vitest";
import { Worker } from "bullmq";
import { QUEUE_LANES, getQueue, getRedisConnection, closeAllQueues, closeRedisConnection } from "@rdv/queue";
import { getOpsQueueDetail } from "../apps/web/lib/opsQueueDetail.js";

/**
 * Wave 6 (Job Reliability hardening): getOpsQueueDetail is the data layer
 * behind the now-admin-gated /ops page. This proves it surfaces a real
 * failed job with its real failure reason (never fabricated), and that
 * retrying that exact job (the same call the retry API route makes) lets
 * it genuinely reach a terminal success -- proving retry actually works,
 * not just that the button exists.
 */
describe("Ops queue detail (Wave 6)", () => {
  let worker: Worker | undefined;

  afterEach(async () => {
    await worker?.close();
    worker = undefined;
  });

  afterAll(async () => {
    await closeAllQueues();
    await closeRedisConnection();
  });

  it("surfaces a real failed job with its real failure reason, then a retry lets it genuinely succeed", async () => {
    const lane = QUEUE_LANES.webhookIngest; // an otherwise-idle lane for a clean, isolated test
    const queue = getQueue(lane);

    let shouldFail = true;
    worker = new Worker(
      lane,
      async (job) => {
        if (job.name !== "ops_hardening_probe") throw new Error(`unexpected job name ${job.name}`);
        if (shouldFail) throw new Error("ops-hardening-deliberate-failure");
        return { ok: true };
      },
      { connection: getRedisConnection() }
    );

    const job = await queue.add("ops_hardening_probe", { probe: true }, { attempts: 1 });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("timed out waiting for job failure")), 8000);
      worker!.on("failed", (failedJob) => {
        if (failedJob?.id === job.id) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    const detailAfterFailure = await getOpsQueueDetail();
    const found = detailAfterFailure.failedJobs.find((j) => j.lane === lane && j.id === job.id);
    expect(found).toBeDefined();
    expect(found?.failedReason).toContain("ops-hardening-deliberate-failure");
    expect(found?.name).toBe("ops_hardening_probe");
    expect(detailAfterFailure.countsByLane[lane].failed).toBeGreaterThanOrEqual(1);

    // Same call the retry API route makes -- proves retry is real, not a
    // fabricated success message.
    shouldFail = false;
    await job.retry("failed");

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("timed out waiting for retried job to complete")), 8000);
      worker!.on("completed", (completedJob) => {
        if (completedJob.id === job.id) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    const detailAfterRetry = await getOpsQueueDetail();
    expect(detailAfterRetry.failedJobs.find((j) => j.lane === lane && j.id === job.id)).toBeUndefined();

    await job.remove();
  }, 20000);
});
