import { describe, expect, it } from "vitest";

import {
  TERMINAL_EVENTS,
  isRustAgentTurnNeutralEvent,
} from "./turnEventClassification";

describe("agent:turn_watchdog wire classification", () => {
  it("is a nonterminal diagnostic, never an event that starts a turn", () => {
    expect(isRustAgentTurnNeutralEvent("agent:turn_watchdog")).toBe(true);
    expect(TERMINAL_EVENTS.has("agent:turn_watchdog")).toBe(false);
  });

  it("preserves actual authoritative completion/error classifications", () => {
    expect(TERMINAL_EVENTS.has("agent:complete")).toBe(true);
    expect(TERMINAL_EVENTS.has("agent:error")).toBe(true);
    expect(isRustAgentTurnNeutralEvent("agent:complete")).toBe(false);
  });
});
