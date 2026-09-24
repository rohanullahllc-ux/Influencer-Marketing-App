import { ALL_QUEUE_LANES, getQueue, type QueueLaneName } from "@rdv/queue";

/**
 * Wave 6 (Safety/Operations/Reliability Hardening): real job reliability
 * visibility for the Operations surface. packages/queue/src/queues.ts's
 * `removeOnFail: false` was already set in Wave 1 specifically so this
 * data would still be here to read once Wave 6 built the surface for it
 * (see that file's own comment) — this module is that surface's data
 * layer.
 *
 * Deliberately kept separate from lib/health.ts's `getSystemHealth()`:
 * that function backs the unauthenticated `/api/health` liveness probe
 * and must stay small/fast/safe-to-expose-without-auth; this one returns
 * real job payloads (which can include workspace/creator/email data) and
 * is only ever read by the now-admin-gated `/ops` page.
 */

export interface QueueLaneCounts {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
}

export interface FailedJobSummary {
  lane: QueueLaneName;
  id: string;
  name: string;
  failedReason: string;
  attemptsMade: number;
  timestamp: number;
  data: unknown;
}

export interface StuckJobSummary {
  lane: QueueLaneName;
  id: string;
  name: string;
  processingForMs: number;
}

export interface OpsQueueDetail {
  countsByLane: Record<QueueLaneName, QueueLaneCounts>;
  failedJobs: FailedJobSummary[];
  stuckJobs: StuckJobSummary[];
}

// A job actively processing longer than this, against local Mock
// providers with no real external network latency, is worth flagging for
// human attention rather than assumed to still be legitimately working —
// this is a triage signal, not an automatic action (nothing here
// cancels/kills a job on its own).
const STUCK_JOB_THRESHOLD_MS = 2 * 60 * 1000;
const MAX_FAILED_JOBS_PER_LANE = 25;

export async function getOpsQueueDetail(): Promise<OpsQueueDetail> {
  const countsByLane = {} as Record<QueueLaneName, QueueLaneCounts>;
  const failedJobs: FailedJobSummary[] = [];
  const stuckJobs: StuckJobSummary[] = [];
  const now = Date.now();

  for (const lane of ALL_QUEUE_LANES) {
    const queue = getQueue(lane);

    const counts = await queue.getJobCounts("waiting", "active", "delayed", "failed", "completed");
    countsByLane[lane] = {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      failed: counts.failed ?? 0,
      completed: counts.completed ?? 0,
    };

    const failed = await queue.getJobs(["failed"], 0, MAX_FAILED_JOBS_PER_LANE - 1, false);
    for (const job of failed) {
      failedJobs.push({
        lane,
        id: job.id ?? "unknown",
        name: job.name,
        failedReason: job.failedReason ?? "Unknown error",
        attemptsMade: job.attemptsMade ?? 0,
        timestamp: job.timestamp,
        data: job.data,
      });
    }

    const active = await queue.getJobs(["active"], 0, 49, false);
    for (const job of active) {
      const startedAt = job.processedOn ?? job.timestamp;
      const processingForMs = now - startedAt;
      if (processingForMs > STUCK_JOB_THRESHOLD_MS) {
        stuckJobs.push({ lane, id: job.id ?? "unknown", name: job.name, processingForMs });
      }
    }
  }

  return { countsByLane, failedJobs, stuckJobs };
}
