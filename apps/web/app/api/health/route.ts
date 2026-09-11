import { NextResponse } from "next/server";
import { getSystemHealth } from "../../../lib/health";

export const dynamic = "force-dynamic";

/**
 * Foundation health-check endpoint (Step 5 §5.1: "a health endpoint that
 * genuinely checks DB and Redis reachability, not just 'the process is
 * up'"). Used by deployment/orchestration tooling and by the Operations
 * surface (apps/web/app/ops) — both share the same getSystemHealth() so
 * there is exactly one source of truth for what "healthy" means.
 */
export async function GET() {
  const health = await getSystemHealth();
  return NextResponse.json(health, { status: health.status === "ok" ? 200 : 503 });
}
