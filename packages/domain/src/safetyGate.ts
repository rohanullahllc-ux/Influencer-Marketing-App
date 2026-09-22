/**
 * Wave 2 Phase 7 (plan §12): the deterministic execution-time safety
 * gate. Pure functions only — no database access, no AI, so the gate
 * itself is trivially deterministic and unit-testable in isolation.
 * dryRun.ts is responsible for loading real data and building the
 * context this module evaluates; it never has final say delegated to it
 * either — this is the authoritative, deterministic decision-maker for
 * "is this specific message eligible right now," never AI.
 */

export interface SendingWindow {
  startHour: number;
  endHour: number;
}

/**
 * Deterministic schedule-validity check (plan §19's Wave 2 scope: "is
 * sending to this creator, right now, inside the campaign's configured
 * window, using the creator's own timezone when known and the workspace
 * default otherwise — never naive UTC"). No `sendingWindow` configured
 * means no restriction (auto-valid) — a window is opt-in per campaign.
 */
export function checkScheduleValidity(params: {
  sendingWindow: SendingWindow | null;
  creatorTimezone: string | null;
  workspaceDefaultTimezone: string | null;
  now?: Date;
}): { valid: boolean; reason: string | null } {
  const { sendingWindow, creatorTimezone, workspaceDefaultTimezone } = params;
  const now = params.now ?? new Date();

  if (!sendingWindow) return { valid: true, reason: null };

  const timezone = creatorTimezone ?? workspaceDefaultTimezone;
  if (!timezone) return { valid: false, reason: "no_timezone_available_to_validate_schedule" };

  let hour: number;
  try {
    const formatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hour12: false });
    const hourPart = formatter.formatToParts(now).find((p) => p.type === "hour")?.value;
    hour = hourPart ? Number(hourPart) % 24 : NaN;
  } catch {
    return { valid: false, reason: "invalid_timezone" };
  }
  if (Number.isNaN(hour)) return { valid: false, reason: "invalid_timezone" };

  const { startHour, endHour } = sendingWindow;
  const withinWindow = startHour <= endHour ? hour >= startHour && hour < endHour : hour >= startHour || hour < endHour;
  return withinWindow
    ? { valid: true, reason: null }
    : { valid: false, reason: `outside_sending_window (local hour ${hour}, window ${startHour}-${endHour})` };
}

export interface SafetyGateContext {
  workspaceActive: boolean;
  campaignStatus: string;
  sendingEnabled: boolean;
  isSuppressed: boolean;
  hasValidApproval: boolean;
  dailyCapReached: boolean;
  firstSendCapReached: boolean;
  /**
   * Wave 3: true when this recipient identity already has a real,
   * non-blocked send outstanding under a *different* campaign in this
   * workspace (product vision: "Cross-campaign contact safeguard with
   * logged human override" — named as part of this same centralized
   * gate, not a separate check). The override itself is a caller-supplied
   * boolean, never something the gate decides on its own; the caller is
   * responsible for logging the override (audit log), this function only
   * decides whether to enforce it.
   */
  crossCampaignBlocked: boolean;
  crossCampaignOverride: boolean;
  isDuplicate: boolean;
  scheduleValid: boolean;
  scheduleReason: string | null;
}

export interface SafetyGateResult {
  eligible: boolean;
  blockReasons: string[];
}

/**
 * Evaluates every check and collects every applicable reason (plan §12:
 * "each blocked row showing its exact reason(s)" — plural), in the order
 * named by docs/PRODUCT_VISION.md's safety-gate list: workspace active ->
 * campaign active/not paused -> kill switch -> suppression -> valid
 * approval -> sending limits -> first-send cap -> cross-campaign safeguard
 * -> idempotency/duplicate -> schedule validity.
 */
export function evaluateSafetyGate(ctx: SafetyGateContext): SafetyGateResult {
  const reasons: string[] = [];

  if (!ctx.workspaceActive) reasons.push("workspace_not_active");
  if (ctx.campaignStatus !== "active") reasons.push(`campaign_not_active_status_${ctx.campaignStatus}`);
  if (!ctx.sendingEnabled) reasons.push("workspace_sending_disabled");
  if (ctx.isSuppressed) reasons.push("suppressed");
  if (!ctx.hasValidApproval) reasons.push("no_valid_approval");
  if (ctx.dailyCapReached) reasons.push("daily_sending_limit_reached");
  if (ctx.firstSendCapReached) reasons.push("first_send_cap_reached");
  if (ctx.crossCampaignBlocked && !ctx.crossCampaignOverride) reasons.push("cross_campaign_contact_safeguard");
  if (ctx.isDuplicate) reasons.push("duplicate_already_marked_eligible");
  if (!ctx.scheduleValid) reasons.push(ctx.scheduleReason ?? "outside_sending_window");

  return { eligible: reasons.length === 0, blockReasons: reasons };
}
