import type {
  AgentRoleDescriptor,
  AgentRoleKind,
  BudgetConsumption,
  BudgetLimits,
  BudgetStatus,
} from "./types";

export const DEFAULT_BUDGET_LIMITS: BudgetLimits = {
  maxTurnTokens: 50_000,
  maxSessionCostUSD: 5.0,
  warningThresholdPercent: 90,
};

export const TEAM_ROLE_REGISTRY: Record<AgentRoleKind, AgentRoleDescriptor> = {
  architect: {
    id: "architect",
    name: "System Architect",
    description:
      "Designs system architecture, defines interfaces, and writes design specifications.",
    allowedToolCategories: ["read", "review"],
    maxTurnTokenLimit: 60_000,
  },
  implementer: {
    id: "implementer",
    name: "Lead Implementer",
    description:
      "Implements production code, refactors modules, and edits files.",
    allowedToolCategories: ["read", "write", "test", "shell"],
    maxTurnTokenLimit: 50_000,
  },
  reviewer: {
    id: "reviewer",
    name: "Code Reviewer",
    description:
      "Conducts code reviews, audits safety, and checks regressions.",
    allowedToolCategories: ["read", "review"],
    maxTurnTokenLimit: 40_000,
  },
  qa: {
    id: "qa",
    name: "QA & Verification Specialist",
    description:
      "Executes unit, regression, and integration tests to ensure quality.",
    allowedToolCategories: ["read", "test", "shell"],
    maxTurnTokenLimit: 40_000,
  },
  research: {
    id: "research",
    name: "Research & Documentation",
    description:
      "Reads docs, researches third-party APIs, and aggregates context.",
    allowedToolCategories: ["read", "browser"],
    maxTurnTokenLimit: 80_000,
  },
};

/**
 * Check if a tool category is permitted for a specific role.
 */
export function isToolAllowedForRole(
  role: AgentRoleKind,
  category: "read" | "write" | "test" | "shell" | "browser" | "review"
): boolean {
  const descriptor = TEAM_ROLE_REGISTRY[role];
  if (!descriptor) return false;
  return descriptor.allowedToolCategories.includes(category);
}

/**
 * Evaluate current budget consumption against limits.
 */
export function evaluateBudget(
  consumption: BudgetConsumption,
  limits: BudgetLimits = DEFAULT_BUDGET_LIMITS
): BudgetStatus {
  const costPercentage =
    (consumption.sessionCostUSD / limits.maxSessionCostUSD) * 100;
  const turnTokenPercentage =
    (consumption.turnTokens / limits.maxTurnTokens) * 100;

  const maxPercentage = Math.max(costPercentage, turnTokenPercentage);

  if (consumption.sessionCostUSD >= limits.maxSessionCostUSD) {
    return {
      withinBudget: false,
      nearLimitWarning: true,
      blockedReason: `Session cost budget of $${limits.maxSessionCostUSD.toFixed(2)} exceeded ($${consumption.sessionCostUSD.toFixed(2)})`,
      percentageUsed: Math.round(costPercentage),
    };
  }

  if (consumption.turnTokens >= limits.maxTurnTokens) {
    return {
      withinBudget: false,
      nearLimitWarning: true,
      blockedReason: `Turn token limit of ${limits.maxTurnTokens.toLocaleString()} exceeded (${consumption.turnTokens.toLocaleString()})`,
      percentageUsed: Math.round(turnTokenPercentage),
    };
  }

  const nearLimit = maxPercentage >= limits.warningThresholdPercent;

  return {
    withinBudget: true,
    nearLimitWarning: nearLimit,
    percentageUsed: Math.round(maxPercentage),
  };
}
