/**
 * Agent-Team Orchestration & Budget Governance Types
 */

export type AgentRoleKind =
  | "architect"
  | "implementer"
  | "reviewer"
  | "qa"
  | "research";

export interface AgentRoleDescriptor {
  id: AgentRoleKind;
  name: string;
  description: string;
  allowedToolCategories: Array<
    "read" | "write" | "test" | "shell" | "browser" | "review"
  >;
  defaultModel?: string;
  maxTurnTokenLimit?: number;
}

export interface BudgetLimits {
  maxTurnTokens: number;
  maxSessionCostUSD: number;
  warningThresholdPercent: number; // e.g. 90%
}

export interface BudgetConsumption {
  sessionTokens: number;
  turnTokens: number;
  sessionCostUSD: number;
}

export interface BudgetStatus {
  withinBudget: boolean;
  nearLimitWarning: boolean;
  blockedReason?: string;
  percentageUsed: number;
}

export interface TeamMember {
  id: string;
  name: string;
  role: AgentRoleKind;
  providerInstanceId: string;
  model: string;
  activeTaskId?: string;
  status: "idle" | "working" | "waiting_approval" | "completed";
}
