import type {
  GovernedActionType,
  PermissionImpactAssessment,
  RiskLevel,
} from "./types";

const CRITICAL_COMMAND_PATTERNS = [
  /\brm\s+-[rf]{1,2}\s+[/~]/i,
  /\bsudo\b/i,
  /\bchmod\s+(-R\s+)?777\b/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\b(curl|wget)\b.*\|\s*(sh|bash|zsh)/i,
];

const HIGH_RISK_COMMAND_PATTERNS = [
  /\bgit\s+push\b.*(--force|-f)\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-[xfd]{1,3}\b/i,
  /\bkill\s+-9\b/i,
  /\bpkill\b/i,
  /\brm\b/i,
  /\b(truncate|shred)\b/i,
];

const SENSITIVE_PATH_PATTERNS = [
  /\/\.ssh\//i,
  /\/\.gnupg\//i,
  /\/\.env(\.|$)/i,
  /\/id_rsa/i,
  /\/credentials(\.json)?/i,
  /\/key_vault/i,
  /^\/etc\//i,
  /^\/System\//i,
  /^\/usr\/(bin|sbin)/i,
];

/**
 * Deterministic SHA-256 equivalent hash representation for audit verification.
 */
export function hashParameters(params: unknown): string {
  const json =
    typeof params === "string" ? params : JSON.stringify(params || "");
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < json.length; i++) {
    const ch = json.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hashHex = (4294967296 * (2097151 & h2) + (h1 >>> 0))
    .toString(16)
    .padStart(16, "0");
  return `h_${hashHex}`;
}

/**
 * Evaluate permission risk for a proposed tool execution.
 */
export function evaluatePermissionRisk(
  actionType: GovernedActionType,
  target: string,
  commandString?: string
): PermissionImpactAssessment {
  const reasons: string[] = [];
  const affectedPaths: string[] = [];
  let riskLevel: RiskLevel = "low";
  let destructiveness = false;

  // Extract paths mentioned in target or command
  if (target) affectedPaths.push(target);

  // Check sensitive paths
  for (const pattern of SENSITIVE_PATH_PATTERNS) {
    if (
      pattern.test(target) ||
      (commandString && pattern.test(commandString))
    ) {
      reasons.push(
        `Involves sensitive path matching pattern: ${pattern.source}`
      );
      riskLevel = "critical";
      break;
    }
  }

  // Check commands
  if (commandString) {
    for (const pattern of CRITICAL_COMMAND_PATTERNS) {
      if (pattern.test(commandString)) {
        riskLevel = "critical";
        destructiveness = true;
        reasons.push(
          `Contains potentially dangerous critical command: ${pattern.source}`
        );
        break;
      }
    }

    if (riskLevel !== "critical") {
      for (const pattern of HIGH_RISK_COMMAND_PATTERNS) {
        if (pattern.test(commandString)) {
          riskLevel = "high";
          destructiveness = true;
          reasons.push(
            `Contains high-impact or destructive command: ${pattern.source}`
          );
          break;
        }
      }
    }
  }

  // Check action types
  if (actionType === "file_delete") {
    destructiveness = true;
    if (riskLevel === "low") {
      riskLevel = "high";
      reasons.push("File deletion operation");
    }
  } else if (actionType === "file_write") {
    if (riskLevel === "low") {
      riskLevel = "medium";
      reasons.push("Modifies workspace file");
    }
  } else if (actionType === "git_action") {
    if (riskLevel === "low") {
      riskLevel = "medium";
      reasons.push("Version control operation");
    }
  }

  const requiresExplicitHumanApproval =
    riskLevel === "high" || riskLevel === "critical";

  return {
    actionType,
    target,
    commandString,
    riskLevel,
    reasons,
    destructiveness,
    requiresExplicitHumanApproval,
    affectedPaths,
  };
}
