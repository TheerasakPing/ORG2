import { describe, expect, it } from "vitest";

import {
  clearNativePhase,
  ingestNativePhase,
  MAX_NATIVE_PHASE_RECORDS,
  nativePhaseDescription,
  type NativePhaseMap,
} from "./nativePhaseEvents";

const provider = (sessionId: string, turnId = "turn-1") => ({
  sessionId, turnId, phase: "provider_request",
});
const toolStart = (sessionId: string, turnId = "turn-1") => ({
  sessionId, turnId, phase: "tool_executing", tool: "functions.exec",
});

describe("native Rust session phase events", () => {
  it("records the provider boundary without treating it as proof of liveness", () => {
    const map = ingestNativePhase(new Map(), provider("session-A"), 1_000);
    expect(map.get("session-A")).toEqual({
      turnId: "turn-1", phase: "provider_request", tool: null, observedAtMs: 1000,
    });
    expect(nativePhaseDescription("provider_request", null)).toContain("heartbeat");
    expect(map.size).toBe(1);
  });

  it("distinguishes actual tool execution start from provider tool proposals", () => {
    let map = ingestNativePhase(new Map(), toolStart("session-A"), 1000);
    expect(map.get("session-A")?.phase).toBe("tool_executing");
    expect(map.get("session-A")?.tool).toBe("functions.exec");
    map = ingestNativePhase(map, {
      sessionId: "session-A", turnId: "turn-1",
      phase: "tool_finished", tool: "functions.exec",
    }, 1400);
    expect(map.get("session-A")?.phase).toBe("tool_finished");
  });

  it("never stores prompts, API keys, tool inputs or custom extra fields", () => {
    const payload = {
      ...toolStart("s"), tool: "shell SECRET=token",
      args: "do not emit", prompt: "super secret", secretUrl: "https://secret.example",
    };
    const map = ingestNativePhase(new Map(), payload, 1000);
    const serialized = JSON.stringify([...map.entries()]);
    for (const secret of ["SECRET", "do not emit", "super secret", "secret.example"]) {
      expect(serialized).not.toContain(secret);
    }
    expect(map.get("s")?.tool).toBeNull();
  });

  it("rejects invalid/unbounded events and leaves map identity intact", () => {
    const current = ingestNativePhase(new Map(), provider("good"), 100);
    const invalid: unknown[] = [
      null, [], {}, { sessionId: "", phase: "provider_request" },
      { sessionId: "x".repeat(257), phase: "provider_request" },
      { sessionId: "x", phase: "arbitrary_phase" },
      { sessionId: "x", phase: "provider_request", turnId: [] },
    ];
    for (const item of invalid) {
      expect(ingestNativePhase(current, item, 200)).toBe(current);
    }
    expect(ingestNativePhase(current, provider("x"), Number.NaN)).toBe(current);
  });

  it("preserves other sessions when one turn terminates", () => {
    let map = ingestNativePhase(new Map(), provider("session-A"), 100);
    map = ingestNativePhase(map, provider("session-B"), 120);
    map = clearNativePhase(map, { sessionId: "session-A", turnId: "turn-1" });
    expect(map.has("session-A")).toBe(false);
    expect(map.get("session-B")?.phase).toBe("provider_request");
  });

  it("drops stale tool completion and ignores a previous turn's terminal event", () => {
    let map = ingestNativePhase(new Map(), provider("session-A", "turn-1"), 100);
    map = ingestNativePhase(map, provider("session-A", "turn-2"), 150);
    expect(ingestNativePhase(map, {
      sessionId: "session-A", turnId: "turn-1", phase: "tool_finished",
    }, 200)).toBe(map);
    expect(clearNativePhase(map, {
      sessionId: "session-A", turnId: "turn-1",
    })).toBe(map);
    expect(clearNativePhase(map, {
      sessionId: "session-A", // Legacy unscoped error must not clear turn-2.
    })).toBe(map);
    expect(map.get("session-A")?.turnId).toBe("turn-2");
    expect(clearNativePhase(map, {
      sessionId: "session-A", turnId: "turn-2",
    }).has("session-A")).toBe(false);
  });

  it("caps tracked observations at 128 independently owned session rows", () => {
    let map: NativePhaseMap = new Map();
    for (let i = 0; i < MAX_NATIVE_PHASE_RECORDS + 15; i++) {
      map = ingestNativePhase(map, provider("session-" + i), i);
    }
    expect(map.size).toBe(MAX_NATIVE_PHASE_RECORDS);
    expect(map.has("session-0")).toBe(false);
    expect(map.has("session-14")).toBe(false);
    expect(map.has("session-15")).toBe(true);
  });
});
