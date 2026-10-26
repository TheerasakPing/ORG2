import { describe, expect, it } from "vitest";

import { type NativePhaseMap, ingestNativePhase } from "./nativePhaseEvents";
import {
  PHASE_OBSERVATION_EXPIRY_MS,
  PHASE_SILENCE_WARNING_MS,
  countQuietSessions,
  phaseAdvisory,
} from "./sessionStallAdvisory";

function phase(id: string, atMs: number): NativePhaseMap {
  return ingestNativePhase(
    new Map(),
    { sessionId: id, turnId: "turn-A", phase: "provider_request" },
    atMs
  );
}

describe("passive phase silence advisory", () => {
  it("classifies recent event without treating it as a true heartbeat", () => {
    const s = phaseAdvisory("s", phase("s", 1000), 2000);
    expect(s.state).toBe("recent");
    expect(s.message).toContain("ไม่ใช่");
  });

  it("warns after five minutes without diagnosing a hang", () => {
    const p = phase("s", 1000);
    const s = phaseAdvisory("s", p, 1000 + PHASE_SILENCE_WARNING_MS);
    expect(s.state).toBe("quiet");
    expect(s.message).toContain("อาจรอ");
    expect(JSON.stringify(s)).not.toContain("hung");
  });

  it("expires very old phase observations without touching stored session state", () => {
    const p = phase("s", 500);
    expect(phaseAdvisory("s", p, 500 + PHASE_OBSERVATION_EXPIRY_MS).state).toBe(
      "expired"
    );
    expect(p.get("s")?.phase).toBe("provider_request");
  });

  it("treats missing or future-dated observations as unavailable", () => {
    expect(phaseAdvisory("absent", new Map(), 100).state).toBe("unavailable");
    expect(phaseAdvisory("s", phase("s", 10_000), 1000).state).toBe(
      "unavailable"
    );
    expect(phaseAdvisory("s", phase("s", 1000), Number.NaN).state).toBe(
      "unavailable"
    );
  });

  it("counts only unique observed session IDs and keeps other sessions isolated", () => {
    let map = phase("A", 0);
    map = ingestNativePhase(
      map,
      {
        sessionId: "B",
        turnId: "turn-B",
        phase: "tool_executing",
        tool: "Read",
      },
      1000
    );
    const now = PHASE_OBSERVATION_EXPIRY_MS + 100;
    const counts = countQuietSessions(["A", "B", "A", "missing"], map, now);
    expect(counts).toEqual({ quiet: 1, expired: 1, observed: 2 });
  });

  it("does not count an unobserved session as a proven stuck worker", () => {
    expect(countQuietSessions(["silent"], new Map(), 999_999)).toEqual({
      quiet: 0,
      expired: 0,
      observed: 0,
    });
  });
});
