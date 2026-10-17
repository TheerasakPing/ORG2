import { describe, expect, it } from "vitest";

import {
  type NativePhaseMap,
  ingestNativePhase,
  ingestNativeProgress,
} from "./nativePhaseEvents";
import {
  PROVIDER_FIRST_OUTPUT_ADVISORY_MS,
  PROVIDER_OUTPUT_GAP_ADVISORY_MS,
  TOOL_RESULT_ADVISORY_MS,
  assessNativeProgress,
} from "./progressAssessment";

function started(
  phase: "provider_request" | "tool_executing" = "provider_request"
) {
  return ingestNativePhase(
    new Map(),
    {
      sessionId: "s1",
      turnId: "turn-1",
      phase,
      tool: phase === "tool_executing" ? "read_file" : null,
    },
    1000
  );
}
function progress(
  map: NativePhaseMap,
  timestamp: number,
  payload: unknown = {
    sessionId: "s1",
    turnId: "turn-1",
    kind: "response_delta",
  }
) {
  return ingestNativeProgress(map, payload, timestamp);
}

describe("native progress watch — advisory only", () => {
  it("records a real provider delta without retaining any content", () => {
    const first = started();
    const next = progress(first, 2000, {
      sessionId: "s1",
      turnId: "turn-1",
      kind: "response_delta",
      content: "SECRET CONTENT",
      toolArgs: "PASSWORD",
      token: "api-key",
    });
    expect(next.get("s1")?.lastProgressAtMs).toBe(2000);
    expect(JSON.stringify([...next.entries()])).not.toContain("SECRET");
    expect(JSON.stringify([...next.entries()])).not.toContain("PASSWORD");
    expect(JSON.stringify([...next.entries()])).not.toContain("api-key");
  });

  it("does not accept old turns, invalid phases, tool periods or future regressions", () => {
    const first = progress(started(), 2000);
    expect(
      progress(first, 3000, {
        sessionId: "s1",
        turnId: "other",
        kind: "response_delta",
      })
    ).toBe(first);
    expect(
      progress(first, 3000, {
        sessionId: "s1",
        turnId: "turn-1",
        kind: "heartbeat",
      })
    ).toBe(first);
    expect(progress(first, 1800)).toBe(first);
    expect(
      progress(first, 3000, { sessionId: "s1", kind: "response_delta" })
    ).toBe(first);
    expect(progress(started("tool_executing"), 2000)).toBeDefined();
    expect(
      progress(started("tool_executing"), 2000).get("s1")?.lastProgressAtMs
    ).toBeNull();
  });

  it("treats missing and backward clock signals as unknown rather than stale", () => {
    expect(assessNativeProgress(undefined, 20_000).level).toBe("unknown");
    expect(assessNativeProgress(started().get("s1"), 500).level).toBe(
      "unknown"
    );
    expect(assessNativeProgress(started().get("s1"), Number.NaN).level).toBe(
      "unknown"
    );
  });

  it("warns after first-output threshold without calling the model hung", () => {
    const entry = started().get("s1");
    expect(
      assessNativeProgress(entry, 1000 + PROVIDER_FIRST_OUTPUT_ADVISORY_MS - 1)
        .level
    ).toBe("observed");
    const report = assessNativeProgress(
      entry,
      1000 + PROVIDER_FIRST_OUTPUT_ADVISORY_MS
    );
    expect(report.level).toBe("quiet");
    expect(report.warning).toContain("90");
    expect(JSON.stringify(report)).not.toContain("hang");
  });

  it("resets provider advisory age only when receiving a real delta", () => {
    const map = progress(started(), 2000);
    const entry = map.get("s1");
    expect(
      assessNativeProgress(entry, 2000 + PROVIDER_OUTPUT_GAP_ADVISORY_MS - 1)
        .level
    ).toBe("observed");
    const report = assessNativeProgress(
      entry,
      2000 + PROVIDER_OUTPUT_GAP_ADVISORY_MS
    );
    expect(report.level).toBe("quiet");
    expect(report.warning).toContain("2");
  });

  it("uses longer advisory window for a real executing tool", () => {
    const entry = started("tool_executing").get("s1");
    expect(
      assessNativeProgress(entry, 1000 + TOOL_RESULT_ADVISORY_MS - 1).level
    ).toBe("observed");
    expect(
      assessNativeProgress(entry, 1000 + TOOL_RESULT_ADVISORY_MS).warning
    ).toContain("5");
  });

  it("does not warn while waiting for human approval or after tool returns", () => {
    const done = ingestNativePhase(
      started("tool_executing"),
      {
        sessionId: "s1",
        turnId: "turn-1",
        phase: "tool_finished",
      },
      2500
    );
    expect(assessNativeProgress(done.get("s1"), 2000000).warning).toBeNull();
  });

  it("supports 1, 5, 20 and 50 concurrent synthetic in-memory sessions", () => {
    for (const n of [1, 5, 20, 50]) {
      let map: NativePhaseMap = new Map();
      for (let i = 0; i < n; i++) {
        map = ingestNativePhase(
          map,
          {
            sessionId: "run-" + i,
            turnId: "turn-" + i,
            phase: "provider_request",
          },
          1000
        );
      }
      expect(map.size).toBe(n);
      expect(
        [...map.values()].every(
          (entry) =>
            assessNativeProgress(
              entry,
              1000 + PROVIDER_FIRST_OUTPUT_ADVISORY_MS
            ).level === "quiet"
        )
      ).toBe(true);
    }
  });
});
