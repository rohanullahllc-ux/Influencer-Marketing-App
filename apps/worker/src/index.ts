import { Worker } from "bullmq";
import { ALL_QUEUE_LANES, getRedisConnection, closeRedisConnection } from "@rdv/queue";
import { getLogger } from "@rdv/lib";
import { getJobProcessor } from "./registry.js";
import "./processors/foundationSmoke.js";
import "./processors/analyzeProduct.js";
import "./processors/creatorDiscovery.js";
import "./processors/creatorMatching.js";
import "./processors/outreachDraft.js";
import "./processors/dryRun.js";

const log = getLogger({ module: "worker" });

const workers = ALL_QUEUE_LANES.map((lane) => {
  const worker = new Worker(
    lane,
    async (job) => {
      const handler = getJobProcessor(lane, job.name);
      if (!handler) {
        // Fail loudly — see registry.ts. BullMQ will retry per the
        // queue's defaultJobOptions and eventually leave it in the
        // failed set for Operations to see, rather than us pretending
        // work happened.
        throw new Error(`No job processor registered for lane="${lane}" jobName="${job.name}"`);
      }
      return handler(job.data, job);
    },
    { connection: getRedisConnection(), concurrency: 5 }
  );

  worker.on("completed", (job) => log.info({ lane, jobId: job.id, jobName: job.name }, "job completed"));
  worker.on("failed", (job, err) =>
    log.error({ lane, jobId: job?.id, jobName: job?.name, err: err.message }, "job failed")
  );

  return worker;
});

log.info({ lanes: ALL_QUEUE_LANES }, "worker process started, listening on all queue lanes");

async function shutdown(signal: string) {
  log.info({ signal }, "worker shutting down");
  await Promise.all(workers.map((w) => w.close()));
  await closeRedisConnection();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
