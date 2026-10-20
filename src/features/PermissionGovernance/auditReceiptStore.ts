import type { AuditReceipt, GovernedActionType, RiskLevel } from "./types";

const MAX_STORED_RECEIPTS = 200;

class AuditReceiptStore {
  private receipts: AuditReceipt[] = [];
  private listeners: Set<() => void> = new Set();

  public recordReceipt(params: {
    sessionId: string;
    turnId?: string;
    actionType: GovernedActionType;
    target: string;
    riskLevel: RiskLevel;
    status: "approved" | "rejected" | "auto_approved" | "timeout";
    approver: "user" | "policy_rule";
    parametersHash: string;
    reason?: string;
  }): AuditReceipt {
    const receipt: AuditReceipt = {
      receiptId: `rcpt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
      ...params,
    };

    this.receipts.unshift(receipt);
    if (this.receipts.length > MAX_STORED_RECEIPTS) {
      this.receipts = this.receipts.slice(0, MAX_STORED_RECEIPTS);
    }

    this.notify();
    return receipt;
  }

  public getReceipts(sessionId?: string): AuditReceipt[] {
    if (!sessionId) return [...this.receipts];
    return this.receipts.filter((r) => r.sessionId === sessionId);
  }

  public clear(): void {
    this.receipts = [];
    this.notify();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const auditReceiptStore = new AuditReceiptStore();
