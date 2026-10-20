import { describe, expect, it } from "vitest";

import {
  evaluatePermissionRisk,
  hashParameters,
} from "../permissionRiskEvaluator";

describe("permissionRiskEvaluator", () => {
  describe("hashParameters", () => {
    it("generates deterministic hash prefix for same inputs", () => {
      const h1 = hashParameters({ command: "git status", branch: "develop" });
      const h2 = hashParameters({ command: "git status", branch: "develop" });
      expect(h1).toBe(h2);
      expect(h1.startsWith("h_")).toBe(true);
    });

    it("generates different hashes for different inputs", () => {
      const h1 = hashParameters({ cmd: "ls" });
      const h2 = hashParameters({ cmd: "rm -rf" });
      expect(h1).not.toBe(h2);
    });
  });

  describe("evaluatePermissionRisk", () => {
    it("rates read-only queries as low risk", () => {
      const assessment = evaluatePermissionRisk(
        "shell_exec",
        "src/util",
        "git status"
      );
      expect(assessment.riskLevel).toBe("low");
      expect(assessment.requiresExplicitHumanApproval).toBe(false);
      expect(assessment.destructiveness).toBe(false);
    });

    it("flags file writing as medium risk", () => {
      const assessment = evaluatePermissionRisk("file_write", "src/index.tsx");
      expect(assessment.riskLevel).toBe("medium");
      expect(assessment.requiresExplicitHumanApproval).toBe(false);
    });

    it("flags high risk for hard reset or file deletion", () => {
      const gitReset = evaluatePermissionRisk(
        "shell_exec",
        "git",
        "git reset --hard HEAD~1"
      );
      expect(gitReset.riskLevel).toBe("high");
      expect(gitReset.destructiveness).toBe(true);
      expect(gitReset.requiresExplicitHumanApproval).toBe(true);

      const fileDel = evaluatePermissionRisk("file_delete", "src/oldFile.ts");
      expect(fileDel.riskLevel).toBe("high");
      expect(fileDel.requiresExplicitHumanApproval).toBe(true);
    });

    it("flags critical risk for rm -rf / or sudo or sensitive credentials", () => {
      const rmRoot = evaluatePermissionRisk("shell_exec", "/", "rm -rf /");
      expect(rmRoot.riskLevel).toBe("critical");
      expect(rmRoot.requiresExplicitHumanApproval).toBe(true);

      const sudoCmd = evaluatePermissionRisk(
        "shell_exec",
        "terminal",
        "sudo apt-get install"
      );
      expect(sudoCmd.riskLevel).toBe("critical");

      const envAccess = evaluatePermissionRisk(
        "file_write",
        "/workspace/.env.production"
      );
      expect(envAccess.riskLevel).toBe("critical");
      expect(envAccess.requiresExplicitHumanApproval).toBe(true);
    });
  });
});
