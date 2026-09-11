import { QUEUE_LANES } from "@rdv/queue";
import { registerJobProcessor } from "../registry.js";

/**
 * The only job processor that exists in Wave 1. Proves the worker
 * process can actually receive and execute a job end-to-end (used by the
 * Wave 1 acceptance test). Real business processors (creator discovery,
 * outreach send, etc.) are added per-lane in their respective waves —
 * this file is not a template to copy for every lane, it's a smoke test.
 */
export interface FoundationSmokeInput {
  echo: string;
}

registerJobProcessor<FoundationSmokeInput, { ok: true; echo: string; processedAt: string }>(
  QUEUE_LANES.aiOps,
  "foundation_smoke_test",
  async (data) => {
    return { ok: true, echo: data.echo, processedAt: new Date().toISOString() };
  }
);
