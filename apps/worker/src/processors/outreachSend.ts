import { QUEUE_LANES } from "@rdv/queue";
import { executeScheduledSend } from "@rdv/domain";
import { registerJobProcessor } from "../registry.js";

/**
 * Wave 3: the `outreach_send_execute` job — re-runs the full safety gate
 * for real and, if eligible, calls the configured outreach provider
 * (Mock, until a real provider is selected — see
 * docs/AUTONOMOUS_V1_PROGRESS.md). Runs on the `outreach-send` lane, the
 * lane Wave 1 reserved for exactly this purpose.
 */
export interface OutreachSendExecuteJobData {
  workspaceId: string;
  outreachSendId: string;
}

registerJobProcessor<OutreachSendExecuteJobData, { status: string }>(
  QUEUE_LANES.outreachSend,
  "outreach_send_execute",
  async (data) => {
    const { workspaceId, outreachSendId } = data;
    return executeScheduledSend({ workspaceId, outreachSendId });
  }
);
