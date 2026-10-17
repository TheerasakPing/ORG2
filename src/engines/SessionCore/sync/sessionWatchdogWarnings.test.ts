import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearAllSessionWatchdogWarnings,
  clearSessionWatchdogWarning,
  getSessionWatchdogWarning,
  recordSessionWatchdogWarning,
  subscribeSessionWatchdogWarning,
} from "./sessionWatchdogWarnings";

function warning(sessionId: string, messageId: string, warningCount = 1) {
  return {
    sessionId,
    messageId,
    elapsedSeconds: 180 + 300 * (warningCount - 1),
    warningCount,
    observeOnly: true,
  };
}

afterEach(clearAllSessionWatchdogWarnings);

describe("session-scoped watchdog diagnostic store", () => {
  it("keeps warnings isolated per session and emits only to its subscribers", () => {
    const a = vi.fn();
    const b = vi.fn();
    const stopA = subscribeSessionWatchdogWarning("session-a", a);
    const stopB = subscribeSessionWatchdogWarning("session-b", b);

    expect(recordSessionWatchdogWarning("session-a", warning("session-a", "turn-1"))).toBe(true);
    expect(getSessionWatchdogWarning("session-a")?.messageId).toBe("turn-1");
    expect(getSessionWatchdogWarning("session-b")).toBeNull();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();

    clearSessionWatchdogWarning("session-a");
    expect(a).toHaveBeenCalledTimes(2);
    stopA();
    stopB();
    recordSessionWatchdogWarning("session-a", warning("session-a", "turn-2"));
    expect(a).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed and cross-session frames", () => {
    expect(recordSessionWatchdogWarning("a", warning("b", "x"))).toBe(false);
    for (const data of [
      null,
      {},
      { ...warning("a", "x"), observeOnly: false },
      { ...warning("a", "x"), elapsedSeconds: NaN },
      { ...warning("a", "x"), elapsedSeconds: 1 },
      { ...warning("a", "x"), warningCount: -1 },
      { ...warning("a", "x"), messageId: "" },
    ]) {
      expect(recordSessionWatchdogWarning("a", data)).toBe(false);
    }
    expect(getSessionWatchdogWarning("a")).toBeNull();
  });

  it("ignores duplicate/older warnings while advancing an active message", () => {
    const notify = vi.fn();
    const stop = subscribeSessionWatchdogWarning("a", notify);
    expect(recordSessionWatchdogWarning("a", warning("a", "x"))).toBe(true);
    expect(recordSessionWatchdogWarning("a", warning("a", "x"))).toBe(false);
    expect(recordSessionWatchdogWarning("a", warning("a", "x", 2))).toBe(true);
    expect(recordSessionWatchdogWarning("a", warning("a", "x"))).toBe(false);
    expect(getSessionWatchdogWarning("a")?.elapsedSeconds).toBe(480);
    expect(notify).toHaveBeenCalledTimes(2);
    stop();
  });

  it("retains warning for duplicate active-turn status but retires it for new turns", () => {
    recordSessionWatchdogWarning("a", warning("a", "old-turn"));
    clearSessionWatchdogWarning("a", "old-turn");
    expect(getSessionWatchdogWarning("a")).not.toBeNull();
    clearSessionWatchdogWarning("a", "new-turn");
    expect(getSessionWatchdogWarning("a")).toBeNull();
  });

  it("bounds in-memory warning snapshots when terminal signals are missing", () => {
    for (let i = 0; i < 150; i++) {
      recordSessionWatchdogWarning(
        `session-${i}`,
        warning(`session-${i}`, `turn-${i}`)
      );
    }
    expect(getSessionWatchdogWarning("session-0")).toBeNull();
    expect(getSessionWatchdogWarning("session-149")).not.toBeNull();
  });
});
