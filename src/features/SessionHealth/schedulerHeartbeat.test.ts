import { describe, expect, it } from "vitest";

import {
  countSchedulerPulseHealth,
  ingestSchedulerPulse,
  MAX_SCHEDULER_HEARTBEAT_RECORDS,
  schedulerPulseHealth,
  schedulerPulseMessage,
  SCHEDULER_HEARTBEAT_LATE_MS,
  SCHEDULER_HEARTBEAT_MISSING_MS,
  type SchedulerPulseMap,
} from "./schedulerHeartbeat";

const pulse = (
  sessionId: string, epoch: number, sequence: number, state = "alive"
) => ({
  sessionId, turnIntentId: "intent-" + epoch, epoch, sequence, state,
  prompt: "SECRET-PROMPT", toolArgs: "private API key", providerUrl: "https://secret",
});

describe("scheduler heartbeat observation", () => {
  it("accepts a minimal heartbeat without storing private data", () => {
    const map = ingestSchedulerPulse(new Map(), pulse("s", 7, 0), 1_000);
    expect(map.get("s")).toEqual({
      turnIntentId: "intent-7", epoch: 7, sequence: 0,
      state: "alive", observedAtMs: 1_000,
    });
    expect(JSON.stringify([...map.values()])).not.toMatch(/SECRET|private API|secret/);
  });

  it("deduplicates repeated ticks without falsely refreshing their age", () => {
    const original = ingestSchedulerPulse(new Map(), pulse("s", 7, 2), 1000);
    const repeated = ingestSchedulerPulse(original, pulse("s", 7, 2), 20_000);
    expect(repeated).toBe(original);
    expect(repeated.get("s")?.observedAtMs).toBe(1000);
    const later = ingestSchedulerPulse(original, pulse("s", 7, 3), 20_000);
    expect(later.get("s")?.observedAtMs).toBe(20_000);
  });

  it("rejects old epochs after a new turn has started", () => {
    const old = ingestSchedulerPulse(new Map(), pulse("s", 1, 5), 1000);
    const fresh = ingestSchedulerPulse(old, pulse("s", 2, 0), 1100);
    expect(ingestSchedulerPulse(fresh, pulse("s", 1, 6), 1200)).toBe(fresh);
    expect(ingestSchedulerPulse(fresh, pulse("s", 1, 7, "finished"), 1300)).toBe(fresh);
    expect(fresh.get("s")?.epoch).toBe(2);
  });

  it("records finished as a tombstone and rejects delayed ticks from the same turn", () => {
    let map = ingestSchedulerPulse(new Map(), pulse("s", 3, 0), 1000);
    map = ingestSchedulerPulse(map, pulse("s", 3, 1, "finished"), 1400);
    expect(map.get("s")?.state).toBe("finished");
    expect(schedulerPulseHealth(map.get("s"), 2000)).toBe("unknown");
    expect(ingestSchedulerPulse(map, pulse("s", 3, 2), 1500)).toBe(map);
    map = ingestSchedulerPulse(map, pulse("s", 4, 0), 1600);
    expect(map.get("s")?.state).toBe("alive");
    expect(map.get("s")?.epoch).toBe(4);
  });

  it("never confuses same-epoch different intent identities", () => {
    const current = ingestSchedulerPulse(new Map(), pulse("s", 3, 4), 500);
    const forged = { ...pulse("s", 3, 5), turnIntentId: "different-intent" };
    expect(ingestSchedulerPulse(current, forged, 800)).toBe(current);
  });

  it("rejects malformed state, nonfinite numbers and oversized IDs", () => {
    const current = ingestSchedulerPulse(new Map(), pulse("s", 2, 1), 1000);
    const invalid = [
      null, {},
      { ...pulse("s", 1, 0), sessionId: "" },
      { ...pulse("s", 1, 0), sessionId: "x".repeat(257) },
      { ...pulse("s", 1, 0), state: "blocked" },
      { ...pulse("s", 1, 0), epoch: -1 },
      { ...pulse("s", 1, 0), epoch: Number.MAX_SAFE_INTEGER + 1 },
      { ...pulse("s", 1, 0), epoch: 0 },
      { ...pulse("s", 1, 0), sequence: -9 },
      { ...pulse("s", 1, 0), turnIntentId: [] },
    ];
    for (const item of invalid) {
      expect(ingestSchedulerPulse(current, item, 2000)).toBe(current);
    }
    expect(ingestSchedulerPulse(current, pulse("s", 3, 0), Number.NaN)).toBe(current);
  });

  it("classifies 45/120-second silence with unknown for absent and terminal", () => {
    const m = ingestSchedulerPulse(new Map(), pulse("s", 3, 1), 1000);
    const e = m.get("s");
    expect(schedulerPulseHealth(e, 1000)).toBe("recent");
    expect(schedulerPulseHealth(e, 1000 + SCHEDULER_HEARTBEAT_LATE_MS - 1)).toBe("recent");
    expect(schedulerPulseHealth(e, 1000 + SCHEDULER_HEARTBEAT_LATE_MS)).toBe("late");
    expect(schedulerPulseHealth(e, 1000 + SCHEDULER_HEARTBEAT_MISSING_MS)).toBe("missing");
    expect(schedulerPulseHealth(e, 999)).toBe("unknown");
    expect(schedulerPulseHealth(undefined, 9999)).toBe("unknown");
    expect(schedulerPulseMessage("missing")).toContain("ไม่ยืนยันว่า Deadlock");
  });

  it("tracks each loaded native session at most once", () => {
    let m: SchedulerPulseMap = ingestSchedulerPulse(new Map(), pulse("recent", 1, 0), 100);
    m = ingestSchedulerPulse(m, pulse("late", 1, 0), 100);
    const now = 100 + SCHEDULER_HEARTBEAT_LATE_MS;
    expect(countSchedulerPulseHealth(
      ["recent", "recent", "late", "unseen"], m, now
    )).toEqual({ recent: 0, late: 2, missing: 0, unknown: 1 });
  });

  it("bounds observations to 128 entries, including turn tombstones", () => {
    let map: SchedulerPulseMap = new Map();
    for (let i = 0; i < MAX_SCHEDULER_HEARTBEAT_RECORDS + 12; i++) {
      map = ingestSchedulerPulse(map, pulse("session-" + i, 1, 0), i);
    }
    expect(map.size).toBe(MAX_SCHEDULER_HEARTBEAT_RECORDS);
    expect(map.has("session-0")).toBe(false);
    expect(map.has("session-11")).toBe(false);
    expect(map.has("session-12")).toBe(true);
  });

  it("ignores ticks and terminal events from different sessions", () => {
    let map = ingestSchedulerPulse(new Map(), pulse("session-a", 5, 0), 50);
    map = ingestSchedulerPulse(map, pulse("session-b", 9, 0), 60);
    map = ingestSchedulerPulse(map, pulse("session-a", 5, 1, "finished"), 65);
    expect(map.get("session-a")?.state).toBe("finished");
    expect(map.get("session-b")?.state).toBe("alive");
    expect(map.get("session-b")?.epoch).toBe(9);
  });
});
