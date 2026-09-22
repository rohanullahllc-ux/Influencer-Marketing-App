import { describe, it, expect } from "vitest";
import { evaluateSafetyGate, checkScheduleValidity, type SafetyGateContext } from "@rdv/domain";

/**
 * Wave 2 Phase 7 (plan §12): the deterministic safety gate — pure
 * function tests covering every named acceptance scenario directly,
 * with no database or AI involved (this module has no dependency on
 * either, by construction).
 */
function baseContext(overrides: Partial<SafetyGateContext> = {}): SafetyGateContext {
  return {
    workspaceActive: true,
    campaignStatus: "active",
    sendingEnabled: true,
    isSuppressed: false,
    hasValidApproval: true,
    dailyCapReached: false,
    firstSendCapReached: false,
    crossCampaignBlocked: false,
    crossCampaignOverride: false,
    isDuplicate: false,
    scheduleValid: true,
    scheduleReason: null,
    ...overrides,
  };
}

describe("Safety gate — evaluateSafetyGate", () => {
  it("a healthy, approved, non-suppressed message inside its window is eligible", () => {
    const result = evaluateSafetyGate(baseContext());
    expect(result.eligible).toBe(true);
    expect(result.blockReasons).toHaveLength(0);
  });

  it("a suppressed contact is blocked regardless of a valid approval", () => {
    const result = evaluateSafetyGate(baseContext({ isSuppressed: true, hasValidApproval: true }));
    expect(result.eligible).toBe(false);
    expect(result.blockReasons).toContain("suppressed");
  });

  it("no valid approval blocks, even if everything else is healthy", () => {
    const result = evaluateSafetyGate(baseContext({ hasValidApproval: false }));
    expect(result.eligible).toBe(false);
    expect(result.blockReasons).toContain("no_valid_approval");
  });

  it("a paused (non-active) campaign blocks everything", () => {
    const result = evaluateSafetyGate(baseContext({ campaignStatus: "paused" }));
    expect(result.eligible).toBe(false);
    expect(result.blockReasons).toContain("campaign_not_active_status_paused");
  });

  it("the workspace kill switch blocks everything workspace-wide", () => {
    const result = evaluateSafetyGate(baseContext({ sendingEnabled: false }));
    expect(result.eligible).toBe(false);
    expect(result.blockReasons).toContain("workspace_sending_disabled");
  });

  it("an inactive workspace blocks everything", () => {
    const result = evaluateSafetyGate(baseContext({ workspaceActive: false }));
    expect(result.eligible).toBe(false);
    expect(result.blockReasons).toContain("workspace_not_active");
  });

  it("outside the sending window is blocked with that specific reason", () => {
    const result = evaluateSafetyGate(baseContext({ scheduleValid: false, scheduleReason: "outside_sending_window (local hour 3, window 9-17)" }));
    expect(result.eligible).toBe(false);
    expect(result.blockReasons).toContain("outside_sending_window (local hour 3, window 9-17)");
  });

  it("sending-limit and first-send-cap reached each block with their own distinct reason", () => {
    const daily = evaluateSafetyGate(baseContext({ dailyCapReached: true }));
    expect(daily.blockReasons).toContain("daily_sending_limit_reached");

    const firstSend = evaluateSafetyGate(baseContext({ firstSendCapReached: true }));
    expect(firstSend.blockReasons).toContain("first_send_cap_reached");
  });

  it("duplicate/idempotency protection blocks with its own distinct reason", () => {
    const result = evaluateSafetyGate(baseContext({ isDuplicate: true }));
    expect(result.eligible).toBe(false);
    expect(result.blockReasons).toContain("duplicate_already_marked_eligible");
  });

  it("Wave 3: a cross-campaign contact block has its own distinct reason", () => {
    const result = evaluateSafetyGate(baseContext({ crossCampaignBlocked: true }));
    expect(result.eligible).toBe(false);
    expect(result.blockReasons).toContain("cross_campaign_contact_safeguard");
  });

  it("Wave 3: an explicit human override lifts the cross-campaign block", () => {
    const result = evaluateSafetyGate(baseContext({ crossCampaignBlocked: true, crossCampaignOverride: true }));
    expect(result.eligible).toBe(true);
    expect(result.blockReasons).not.toContain("cross_campaign_contact_safeguard");
  });

  it("Wave 3: the override flag alone (no actual cross-campaign block) changes nothing", () => {
    const result = evaluateSafetyGate(baseContext({ crossCampaignBlocked: false, crossCampaignOverride: true }));
    expect(result.eligible).toBe(true);
  });

  it("collects every applicable reason at once, not just the first", () => {
    const result = evaluateSafetyGate(
      baseContext({ isSuppressed: true, hasValidApproval: false, sendingEnabled: false })
    );
    expect(result.blockReasons).toEqual(
      expect.arrayContaining(["workspace_sending_disabled", "suppressed", "no_valid_approval"])
    );
    expect(result.blockReasons.length).toBeGreaterThanOrEqual(3);
  });
});

describe("Safety gate — checkScheduleValidity", () => {
  it("no configured sending window means no restriction", () => {
    const result = checkScheduleValidity({ sendingWindow: null, creatorTimezone: null, workspaceDefaultTimezone: null });
    expect(result.valid).toBe(true);
  });

  it("uses the creator's own timezone when known", () => {
    // Fixed instant: 2026-06-15T12:00:00Z = 08:00 in America/New_York (EDT, UTC-4).
    const now = new Date("2026-06-15T12:00:00Z");
    const inWindow = checkScheduleValidity({
      sendingWindow: { startHour: 7, endHour: 18 },
      creatorTimezone: "America/New_York",
      workspaceDefaultTimezone: "UTC",
      now,
    });
    expect(inWindow.valid).toBe(true);

    const outOfWindow = checkScheduleValidity({
      sendingWindow: { startHour: 9, endHour: 17 },
      creatorTimezone: "America/New_York",
      workspaceDefaultTimezone: "UTC",
      now,
    });
    expect(outOfWindow.valid).toBe(false);
    expect(outOfWindow.reason).toMatch(/outside_sending_window/);
  });

  it("falls back to the workspace default timezone when the creator's is unknown", () => {
    const now = new Date("2026-06-15T12:00:00Z"); // 12:00 UTC
    const result = checkScheduleValidity({
      sendingWindow: { startHour: 9, endHour: 17 },
      creatorTimezone: null,
      workspaceDefaultTimezone: "UTC",
      now,
    });
    expect(result.valid).toBe(true);
  });

  it("blocks (never guesses UTC) when a window is configured but no timezone is available at all", () => {
    const result = checkScheduleValidity({
      sendingWindow: { startHour: 9, endHour: 17 },
      creatorTimezone: null,
      workspaceDefaultTimezone: null,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("no_timezone_available_to_validate_schedule");
  });

  it("handles a window that wraps past midnight", () => {
    // Window 22-6 (10pm-6am): hour 23 is inside, hour 12 is outside.
    const lateNight = checkScheduleValidity({
      sendingWindow: { startHour: 22, endHour: 6 },
      creatorTimezone: "UTC",
      workspaceDefaultTimezone: null,
      now: new Date("2026-06-15T23:00:00Z"),
    });
    expect(lateNight.valid).toBe(true);

    const midday = checkScheduleValidity({
      sendingWindow: { startHour: 22, endHour: 6 },
      creatorTimezone: "UTC",
      workspaceDefaultTimezone: null,
      now: new Date("2026-06-15T12:00:00Z"),
    });
    expect(midday.valid).toBe(false);
  });
});
