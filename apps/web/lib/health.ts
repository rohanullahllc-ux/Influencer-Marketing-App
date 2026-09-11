import { queryClient } from "@rdv/db";
import { getRedisConnection, ALL_QUEUE_LANES, getQueue } from "@rdv/queue";

export interface HealthCheck {
  ok: boolean;
  error?: string;
}

export interface SystemHealth {
  status: "ok" | "degraded";
  checks: Record<string, HealthCheck>;
  queueDepth: Record<string, number>;
  timestamp: string;
}

/** Shared by the /api/health route and the /ops page — one source of truth. */
export async function getSystemHealth(): Promise<SystemHealth> {
  const checks: Record<string, HealthCheck> = {};

  try {
    await queryClient`select 1`;
    checks.database = { ok: true };
  } catch (err) {
    checks.database = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  try {
    const pong = await getRedisConnection().ping();
    checks.redis = { ok: pong === "PONG" };
  } catch (err) {
    checks.redis = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const queueDepth: Record<string, number> = {};
  if (checks.redis?.ok) {
    for (const lane of ALL_QUEUE_LANES) {
      try {
        const counts = await getQueue(lane).getJobCounts("waiting", "active", "failed");
        queueDepth[lane] = (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.failed ?? 0);
      } catch {
        queueDepth[lane] = -1;
      }
    }
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  return { status: allOk ? "ok" : "degraded", checks, queueDepth, timestamp: new Date().toISOString() };
}
