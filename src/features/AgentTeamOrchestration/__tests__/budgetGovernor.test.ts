import { describe, expect, it } from "vitest";

import { evaluateBudget, isToolAllowedForRole } from "../budgetGovernor";
import type { BudgetConsumption, BudgetLimits } from "../types";

describe("budgetGovernor", () => {
  describe("isToolAllowedForRole", () => {
    it("allows write tools for implementer but not architect or reviewer", () => {
      expect(isToolAllowedForRole("implementer", "write")).toBe(true);
      expect(isToolAllowedForRole("architect", "write")).toBe(false);
      expect(isToolAllowedForRole("reviewer", "write")).toBe(false);
    });

    it("allows test tools for QA and implementer", () => {
      expect(isToolAllowedForRole("qa", "test")).toBe(true);
      expect(isToolAllowedForRole("implementer", "test")).toBe(true);
      expect(isToolAllowedForRole("research", "test")).toBe(false);
    });

    it("allows browser tools for research", () => {
      expect(isToolAllowedForRole("research", "browser")).toBe(true);
      expect(isToolAllowedForRole("architect", "browser")).toBe(false);
    });
  });

  describe("evaluateBudget", () => {
    const limits: BudgetLimits = {
      maxTurnTokens: 50_000,
      maxSessionCostUSD: 5.0,
      warningThresholdPercent: 90,
    };

    it("reports healthy within budget when consumption is low", () => {
      const consumption: BudgetConsumption = {
        sessionTokens: 20_000,
        turnTokens: 5_000,
        sessionCostUSD: 0.5,
      };

      const status = evaluateBudget(consumption, limits);
      expect(status.withinBudget).toBe(true);
      expect(status.nearLimitWarning).toBe(false);
      expect(status.blockedReason).toBeUndefined();
    });

    it("flags warning when approaching 90% threshold", () => {
      const consumption: BudgetConsumption = {
        sessionTokens: 100_000,
        turnTokens: 46_000, // 46,000 / 50,000 = 92%
        sessionCostUSD: 2.0,
      };

      const status = evaluateBudget(consumption, limits);
      expect(status.withinBudget).toBe(true);
      expect(status.nearLimitWarning).toBe(true);
      expect(status.percentageUsed).toBe(92);
    });

    it("blocks execution when cost limit is exceeded", () => {
      const consumption: BudgetConsumption = {
        sessionTokens: 500_000,
        turnTokens: 10_000,
        sessionCostUSD: 5.25,
      };

      const status = evaluateBudget(consumption, limits);
      expect(status.withinBudget).toBe(false);
      expect(status.blockedReason).toContain("Session cost budget");
    });

    it("blocks execution when turn token limit is exceeded", () => {
      const consumption: BudgetConsumption = {
        sessionTokens: 60_000,
        turnTokens: 52_000,
        sessionCostUSD: 1.0,
      };

      const status = evaluateBudget(consumption, limits);
      expect(status.withinBudget).toBe(false);
      expect(status.blockedReason).toContain("Turn token limit");
    });
  });
});
