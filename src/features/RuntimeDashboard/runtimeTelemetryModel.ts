import type {
  ModelPricing,
  RetryIncident,
  RuntimeTelemetrySnapshot,
  SessionSystemStatus,
  SessionTokenUsage,
  ToolLatencyMetric,
} from "./types";

/**
 * Standard model pricing table per million tokens (USD).
 */
export const MODEL_PRICING_REGISTRY: Record<string, ModelPricing> = {
  // OpenAI / Codex
  "gpt-6.1-sol": {
    inputPerMillionUSD: 3.0,
    outputPerMillionUSD: 12.0,
    cachedInputPerMillionUSD: 1.5,
  },
  "gpt-6-astra": {
    inputPerMillionUSD: 2.5,
    outputPerMillionUSD: 10.0,
    cachedInputPerMillionUSD: 1.25,
  },
  "gpt-6-sol": {
    inputPerMillionUSD: 2.5,
    outputPerMillionUSD: 10.0,
    cachedInputPerMillionUSD: 1.25,
  },
  "gpt-5.6-sol": {
    inputPerMillionUSD: 2.0,
    outputPerMillionUSD: 8.0,
    cachedInputPerMillionUSD: 1.0,
  },

  // Anthropic / Claude
  "claude-opus-5-5": {
    inputPerMillionUSD: 15.0,
    outputPerMillionUSD: 75.0,
    cachedInputPerMillionUSD: 3.75,
  },
  "claude-sonnet-5-5": {
    inputPerMillionUSD: 3.0,
    outputPerMillionUSD: 15.0,
    cachedInputPerMillionUSD: 0.75,
  },
  "claude-haiku-5-5": {
    inputPerMillionUSD: 0.8,
    outputPerMillionUSD: 4.0,
    cachedInputPerMillionUSD: 0.2,
  },

  // Google / Gemini
  "gemini-3.8-flash": {
    inputPerMillionUSD: 0.15,
    outputPerMillionUSD: 0.6,
    cachedInputPerMillionUSD: 0.0375,
  },
  "gemini-3.1-pro": {
    inputPerMillionUSD: 1.25,
    outputPerMillionUSD: 5.0,
    cachedInputPerMillionUSD: 0.3125,
  },
};

export const DEFAULT_PRICING: ModelPricing = {
  inputPerMillionUSD: 2.0,
  outputPerMillionUSD: 8.0,
  cachedInputPerMillionUSD: 1.0,
};

/**
 * Calculate estimated cost in USD from token usage and model pricing.
 */
export function calculateEstimatedCost(
  tokens: SessionTokenUsage,
  model: string
): number {
  const pricing = MODEL_PRICING_REGISTRY[model] || DEFAULT_PRICING;
  const regularInput = Math.max(0, tokens.inputTokens - tokens.cachedTokens);
  const cachedInput = Math.min(tokens.inputTokens, tokens.cachedTokens);

  const inputCost = (regularInput / 1_000_000) * pricing.inputPerMillionUSD;
  const cachedCost =
    (cachedInput / 1_000_000) *
    (pricing.cachedInputPerMillionUSD ?? pricing.inputPerMillionUSD * 0.5);
  const outputCost =
    (tokens.outputTokens / 1_000_000) * pricing.outputPerMillionUSD;

  return Math.round((inputCost + cachedCost + outputCost) * 100_000) / 100_000;
}

/**
 * Aggregate raw tool execution durations into latency metrics including p95.
 */
export function aggregateToolLatencies(
  rawExecutions: Array<{ toolName: string; durationMs: number }>
): ToolLatencyMetric[] {
  const grouped = new Map<string, number[]>();

  for (const { toolName, durationMs } of rawExecutions) {
    const list = grouped.get(toolName) || [];
    list.push(Math.max(0, durationMs));
    grouped.set(toolName, list);
  }

  const results: ToolLatencyMetric[] = [];

  for (const [toolName, durations] of grouped.entries()) {
    if (durations.length === 0) continue;
    const sorted = [...durations].sort((a, b) => a - b);
    const count = sorted.length;
    const total = sorted.reduce((acc, curr) => acc + curr, 0);
    const min = sorted[0];
    const max = sorted[count - 1];
    const avg = Math.round(total / count);

    // Calculate p95 index
    const p95Index = Math.min(count - 1, Math.floor(count * 0.95));
    const p95 = sorted[p95Index];

    results.push({
      toolName,
      callCount: count,
      totalDurationMs: total,
      minDurationMs: min,
      maxDurationMs: max,
      avgDurationMs: avg,
      p95DurationMs: p95,
    });
  }

  // Sort descending by call count
  return results.sort((a, b) => b.callCount - a.callCount);
}

/**
 * Build a complete runtime telemetry snapshot.
 */
export function createRuntimeTelemetrySnapshot(params: {
  sessionId: string;
  provider: string;
  model: string;
  tokens: SessionTokenUsage;
  rawToolExecutions?: Array<{ toolName: string; durationMs: number }>;
  retryIncidents?: RetryIncident[];
  systemStatus?: Partial<SessionSystemStatus>;
}): RuntimeTelemetrySnapshot {
  const toolLatencies = aggregateToolLatencies(params.rawToolExecutions || []);
  const estimatedCostUSD = calculateEstimatedCost(params.tokens, params.model);

  const defaultStatus: SessionSystemStatus = {
    memoryQueueDepth: 0,
    activeWorkers: 1,
    idleWorkers: 0,
    estimatedCpuPercent: 0,
    estimatedMemoryRssMb: 0,
    pendingApprovalsCount: 0,
  };

  return {
    sessionId: params.sessionId,
    provider: params.provider,
    model: params.model,
    tokens: {
      ...params.tokens,
      totalTokens: params.tokens.inputTokens + params.tokens.outputTokens,
    },
    estimatedCostUSD,
    toolLatencies,
    retryIncidents: params.retryIncidents || [],
    systemStatus: { ...defaultStatus, ...params.systemStatus },
    updatedAt: new Date().toISOString(),
  };
}
