/**
 * Runtime Telemetry & Dashboard Data Types
 */

export interface ModelPricing {
  inputPerMillionUSD: number;
  outputPerMillionUSD: number;
  cachedInputPerMillionUSD?: number;
}

export interface SessionTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  contextLimit: number;
}

export interface ToolLatencyMetric {
  toolName: string;
  callCount: number;
  totalDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  avgDurationMs: number;
  p95DurationMs: number;
}

export interface RetryIncident {
  id: string;
  timestamp: string;
  category:
    | "network_drop"
    | "rate_limit"
    | "schema_validation"
    | "timeout"
    | "tool_error";
  message: string;
  resolved: boolean;
}

export interface SessionSystemStatus {
  memoryQueueDepth: number;
  activeWorkers: number;
  idleWorkers: number;
  estimatedCpuPercent: number;
  estimatedMemoryRssMb: number;
  pendingApprovalsCount: number;
}

export interface RuntimeTelemetrySnapshot {
  sessionId: string;
  provider: string;
  model: string;
  tokens: SessionTokenUsage;
  estimatedCostUSD: number;
  toolLatencies: ToolLatencyMetric[];
  retryIncidents: RetryIncident[];
  systemStatus: SessionSystemStatus;
  updatedAt: string;
}
