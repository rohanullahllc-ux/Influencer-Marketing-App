import type { Job } from "bullmq";
import type { QueueLaneName } from "@rdv/queue";

/**
 * Per-lane, per-job-name processor registry. Deliberately NOT "one
 * catch-all processor function per lane that does a switch on job.name
 * and silently no-ops on an unknown name" — an unrecognized job name
 * must fail loudly (BullMQ then applies its normal retry/backoff and
 * eventually dead-letters it for Operations to see), never be silently
 * marked complete. This matters because Wave 1 has no real business job
 * processors yet: it would be actively dangerous for the worker to start
 * consuming a lane's queue with a processor that treats every job as
 * "done" regardless of what it actually is.
 */
type JobHandler<TData = unknown, TResult = unknown> = (data: TData, job: Job<TData>) => Promise<TResult>;

const registry = new Map<string, JobHandler>();

function key(lane: QueueLaneName, jobName: string): string {
  return `${lane}::${jobName}`;
}

export function registerJobProcessor<TData, TResult>(
  lane: QueueLaneName,
  jobName: string,
  handler: JobHandler<TData, TResult>
): void {
  const k = key(lane, jobName);
  if (registry.has(k)) {
    throw new Error(`Job processor already registered for lane="${lane}" jobName="${jobName}"`);
  }
  registry.set(k, handler as JobHandler);
}

export function getJobProcessor(lane: QueueLaneName, jobName: string): JobHandler | undefined {
  return registry.get(key(lane, jobName));
}
