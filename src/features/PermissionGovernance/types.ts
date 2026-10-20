/**
 * Permission Governance & Audit Receipt Data Types
 */

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type GovernedActionType =
  | "shell_exec"
  | "file_write"
  | "file_delete"
  | "mcp_call"
  | "browser_action"
  | "git_action";

export interface PermissionImpactAssessment {
  actionType: GovernedActionType;
  target: string;
  commandString?: string;
  riskLevel: RiskLevel;
  reasons: string[];
  destructiveness: boolean;
  requiresExplicitHumanApproval: boolean;
  affectedPaths: string[];
}

export interface AuditReceipt {
  receiptId: string;
  timestamp: string;
  sessionId: string;
  turnId?: string;
  actionType: GovernedActionType;
  target: string;
  riskLevel: RiskLevel;
  status: "approved" | "rejected" | "auto_approved" | "timeout";
  approver: "user" | "policy_rule";
  parametersHash: string;
  reason?: string;
}
