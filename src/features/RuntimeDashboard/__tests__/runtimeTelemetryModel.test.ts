import { describe, expect, it } from "vitest";

import {
  aggregateToolLatencies,
  calculateEstimatedCost,
  createRuntimeTelemetrySnapshot,
} from "../runtimeTelemetryModel";
import type { SessionTokenUsage } from "../types";

describe("runtimeTelemetryModel", () => {
  describe("calculateEstimatedCost", () => {
    it("calculates cost accurately for known model without cache", () => {
      const tokens: SessionTokenUsage = {
        inputTokens: 100_000,
        outputTokens: 50_000,
        cachedTokens: 0,
        totalTokens: 150_000,
        contextLimit: 200_000,
      };

      // claude-sonnet-5-5: $3 / M in, $15 / M out
      // In: 0.1 * 3 = 0.3
      // Out: 0.05 * 15 = 0.75
      // Total = 1.05
      const cost = calculateEstimatedCost(tokens, "claude-sonnet-5-5");
      expect(cost).toBeCloseTo(1.05, 4);
    });

    it("applies cached input discount when cachedTokens > 0", () => {
      const tokens: SessionTokenUsage = {
        inputTokens: 100_000,
        outputTokens: 10_000,
        cachedTokens: 60_000,
        totalTokens: 110_000,
        contextLimit: 200_000,
      };

      // Regular in: 40k ($3/M) = $0.12
      // Cached in: 60k ($0.75/M) = $0.045
      // Out: 10k ($15/M) = $0.15
      // Total = 0.12 + 0.045 + 0.15 = 0.315
      const cost = calculateEstimatedCost(tokens, "claude-sonnet-5-5");
      expect(cost).toBeCloseTo(0.315, 4);
    });

    it("uses default fallback pricing when model is unknown", () => {
      const tokens: SessionTokenUsage = {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cachedTokens: 0,
        totalTokens: 2_000_000,
        contextLimit: 200_000,
      };

      // Default: $2 / M in, $8 / M out -> $10.0
      const cost = calculateEstimatedCost(tokens, "custom-unknown-model");
      expect(cost).toBeCloseTo(10.0, 4);
    });
  });

  describe("aggregateToolLatencies", () => {
    it("returns empty list for empty inputs", () => {
      expect(aggregateToolLatencies([])).toEqual([]);
    });

    it("correctly calculates min, avg, max, and p95 latency", () => {
      const executions = [
        { toolName: "run_command", durationMs: 100 },
        { toolName: "run_command", durationMs: 200 },
        { toolName: "run_command", durationMs: 300 },
        { toolName: "run_command", durationMs: 400 },
        { toolName: "run_command", durationMs: 500 },
        { toolName: "view_file", durationMs: 50 },
      ];

      const metrics = aggregateToolLatencies(executions);
      expect(metrics).toHaveLength(2);

      const runCommand = metrics.find((m) => m.toolName === "run_command");
      expect(runCommand).toBeDefined();
      expect(runCommand?.callCount).toBe(5);
      expect(runCommand?.minDurationMs).toBe(100);
      expect(runCommand?.maxDurationMs).toBe(500);
      expect(runCommand?.avgDurationMs).toBe(300);
      expect(runCommand?.totalDurationMs).toBe(1500);
      // p95 for 5 items index Math.floor(5 * 0.95) = 4 (value 500)
      expect(runCommand?.p95DurationMs).toBe(500);

      const viewFile = metrics.find((m) => m.toolName === "view_file");
      expect(viewFile?.callCount).toBe(1);
      expect(viewFile?.avgDurationMs).toBe(50);
    });
  });

  describe("createRuntimeTelemetrySnapshot", () => {
    it("constructs full snapshot with system defaults and computed totals", () => {
      const snapshot = createRuntimeTelemetrySnapshot({
        sessionId: "session-abc-123",
        provider: "anthropic",
        model: "claude-sonnet-5-5",
        tokens: {
          inputTokens: 200_000,
          outputTokens: 50_000,
          cachedTokens: 100_000,
          totalTokens: 0,
          contextLimit: 1_000_000,
        },
        rawToolExecutions: [
          { toolName: "client_view_file", durationMs: 45 },
          { toolName: "client_view_file", durationMs: 55 },
        ],
        systemStatus: {
          memoryQueueDepth: 2,
          pendingApprovalsCount: 1,
        },
      });

      expect(snapshot.sessionId).toBe("session-abc-123");
      expect(snapshot.tokens.totalTokens).toBe(250_000);
      expect(snapshot.estimatedCostUSD).toBeGreaterThan(0);
      expect(snapshot.toolLatencies).toHaveLength(1);
      expect(snapshot.toolLatencies[0].avgDurationMs).toBe(50);
      expect(snapshot.systemStatus.memoryQueueDepth).toBe(2);
      expect(snapshot.systemStatus.pendingApprovalsCount).toBe(1);
      expect(snapshot.systemStatus.activeWorkers).toBe(1);
    });
  });
});
