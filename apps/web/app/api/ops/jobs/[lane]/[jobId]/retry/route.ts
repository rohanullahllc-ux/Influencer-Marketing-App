import { NextResponse } from "next/server";
import { ALL_QUEUE_LANES, getQueue, type QueueLaneName } from "@rdv/queue";
import { withWorkspace, writeAuditLog } from "@rdv/db";
import { AuthorizationError, ValidationError } from "@rdv/lib";
import { requireSession } from "../../../../../../../lib/session";
import { errorResponse } from "../../../../../../../lib/apiError";

export const dynamic = "force-dynamic";

/**
 * Wave 6 (Job Reliability hardening): retries a real failed job in place
 * -- never a fabricated "retry", the actual BullMQ job re-enters the
 * queue and the same registered processor runs again. This is a
 * deliberately manual, human-triggered action (no auto-retry-forever
 * loop anywhere in this codebase beyond BullMQ's own configured attempts/
 * backoff) — an admin is the one deciding a failure is worth retrying.
 * Safe by construction for every job in this system: every processor that
 * mutates state (outreach send, affiliate creation) is itself idempotent/
 * interruption-safe (see their own domain modules), so re-running the
 * exact same job can never cause a duplicate real-world action.
 */
export async function POST(_req: Request, { params }: { params: { lane: string; jobId: string } }) {
  try {
    const actor = await requireSession();
    if (actor.role !== "owner" && actor.role !== "admin") {
      throw new AuthorizationError("Only an Owner or Admin may retry a failed job");
    }

    if (!ALL_QUEUE_LANES.includes(params.lane as QueueLaneName)) {
      throw new ValidationError(`Unknown queue lane "${params.lane}"`);
    }
    const lane = params.lane as QueueLaneName;

    const job = await getQueue(lane).getJob(params.jobId);
    if (!job) throw new ValidationError(`No job with id ${params.jobId} in lane ${lane}`);

    await job.retry("failed");

    // Every job's data payload in this system carries the workspaceId it
    // operates on (it is, after all, always a workspace-scoped domain
    // action) -- reuse the existing audit log rather than a parallel
    // ops-only mechanism. A job with no workspaceId (none exist today) is
    // simply not audited by workspace, not an error.
    const jobWorkspaceId = (job.data as { workspaceId?: string } | undefined)?.workspaceId;
    if (jobWorkspaceId) {
      await withWorkspace(jobWorkspaceId, (tx) =>
        writeAuditLog(tx, {
          workspaceId: jobWorkspaceId,
          actorUserId: actor.userId,
          action: "ops.job_retried",
          entityType: "queue_job",
          entityId: job.id ?? null,
          metadata: { lane, jobName: job.name },
        })
      );
    }

    return NextResponse.json({ retried: true });
  } catch (err) {
    return errorResponse(err);
  }
}
