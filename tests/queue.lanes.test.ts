import { describe, it, expect, afterAll } from "vitest";
import { ALL_QUEUE_LANES, QUEUE_LANES, getQueue, closeAllQueues, closeRedisConnection } from "@rdv/queue";

describe("Queue lanes", () => {
  afterAll(async () => {
    await closeAllQueues();
    await closeRedisConnection();
  });

  it("defines exactly the 5 required named lanes (Step 4 decision #15)", () => {
    expect(ALL_QUEUE_LANES.sort()).toEqual(
      [
        QUEUE_LANES.creatorDiscovery,
        QUEUE_LANES.outreachSend,
        QUEUE_LANES.whopSync,
        QUEUE_LANES.webhookIngest,
        QUEUE_LANES.aiOps,
      ].sort()
    );
    expect(ALL_QUEUE_LANES).toHaveLength(5);
  });

  it("each lane is a real, independently-addressable BullMQ queue backed by Redis", async () => {
    const queue = getQueue(QUEUE_LANES.outreachSend);
    const job = await queue.add("test-job", { hello: "world" });
    expect(job.id).toBeDefined();

    const counts = await queue.getJobCounts();
    expect((counts.waiting ?? 0) + (counts.active ?? 0)).toBeGreaterThanOrEqual(1);

    await job.remove();
  });

  it("lanes are isolated from each other (a job in one lane never appears in another)", async () => {
    const discoveryQueue = getQueue(QUEUE_LANES.creatorDiscovery);
    const aiQueue = getQueue(QUEUE_LANES.aiOps);

    const job = await discoveryQueue.add("probe", { marker: "discovery-only" });
    const aiJobs = await aiQueue.getJobs(["waiting", "active", "delayed"]);
    expect(aiJobs.find((j) => j.id === job.id)).toBeUndefined();

    await job.remove();
  });
});
