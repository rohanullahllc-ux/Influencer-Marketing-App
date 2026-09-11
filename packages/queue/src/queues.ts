import { Queue, type QueueOptions } from "bullmq";
import { getRedisConnection } from "./connection.js";
import { ALL_QUEUE_LANES, type QueueLaneName } from "./lanes.js";

const queueInstances = new Map<QueueLaneName, Queue>();

const DEFAULT_QUEUE_OPTIONS: Partial<QueueOptions> = {
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 60 * 60 * 24 * 7 }, // 7 days
    // Failed jobs are NEVER auto-removed: Step 5's UNKNOWN/AMBIGUOUS-state
    // rule requires every failure to be reconcilable/escalatable, not
    // silently garbage-collected. The Operations surface (Wave 6) reads
    // these.
    removeOnFail: false,
  },
};

/** Returns the (lazily created, singleton per lane) BullMQ Queue for a lane. */
export function getQueue(lane: QueueLaneName): Queue {
  let queue = queueInstances.get(lane);
  if (!queue) {
    queue = new Queue(lane, { connection: getRedisConnection(), ...DEFAULT_QUEUE_OPTIONS });
    queueInstances.set(lane, queue);
  }
  return queue;
}

export function getAllQueues(): Queue[] {
  return ALL_QUEUE_LANES.map(getQueue);
}

export async function closeAllQueues(): Promise<void> {
  await Promise.all([...queueInstances.values()].map((q) => q.close()));
  queueInstances.clear();
}
