import React, { useState } from "react";

import type { RuntimeTelemetrySnapshot } from "./types";

interface RuntimeDashboardPanelProps {
  snapshot: RuntimeTelemetrySnapshot;
  onClose?: () => void;
  onRefresh?: () => void;
}

export const RuntimeDashboardPanel: React.FC<RuntimeDashboardPanelProps> = ({
  snapshot,
  onClose,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<
    "overview" | "tools" | "resilience"
  >("overview");

  const contextUsagePercent = Math.min(
    100,
    Math.round(
      (snapshot.tokens.totalTokens /
        (snapshot.tokens.contextLimit || 200_000)) *
        100
    )
  );

  return (
    <div
      data-testid="runtime-dashboard-panel"
      style={{
        display: "flex",
        flexDirection: "column",
        background: "var(--color-bg-subtle, #141416)",
        border: "1px solid var(--color-border-subtle, #2a2a2e)",
        borderRadius: "8px",
        padding: "16px",
        color: "var(--color-text-primary, #e2e8f0)",
        fontSize: "13px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        maxWidth: "680px",
        width: "100%",
        boxShadow: "0 10px 25px rgba(0,0,0,0.4)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "14px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "16px" }}>📊</span>
          <span style={{ fontWeight: 600, fontSize: "14px" }}>
            Runtime Telemetry Dashboard
          </span>
          <span
            style={{
              fontSize: "11px",
              padding: "2px 6px",
              borderRadius: "4px",
              background: "rgba(59, 130, 246, 0.15)",
              color: "#60a5fa",
              fontWeight: 500,
            }}
          >
            {snapshot.model}
          </span>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {onRefresh && (
            <button
              onClick={onRefresh}
              style={{
                background: "transparent",
                border: "1px solid var(--color-border-subtle, #334155)",
                color: "var(--color-text-secondary, #94a3b8)",
                borderRadius: "4px",
                padding: "4px 8px",
                cursor: "pointer",
                fontSize: "12px",
              }}
            >
              ↻ Refresh
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--color-text-secondary, #94a3b8)",
                cursor: "pointer",
                fontSize: "16px",
                lineHeight: 1,
              }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: "6px",
          borderBottom: "1px solid var(--color-border-subtle, #2a2a2e)",
          paddingBottom: "8px",
          marginBottom: "14px",
        }}
      >
        {(["overview", "tools", "resilience"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background:
                activeTab === tab ? "rgba(255, 255, 255, 0.08)" : "transparent",
              color: activeTab === tab ? "#f8fafc" : "#94a3b8",
              border: "none",
              borderRadius: "4px",
              padding: "4px 10px",
              fontSize: "12px",
              fontWeight: activeTab === tab ? 600 : 400,
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab 1: Overview */}
      {activeTab === "overview" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px",
          }}
        >
          {/* Card 1: Token Consumption */}
          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              padding: "12px",
              borderRadius: "6px",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div
              style={{
                color: "#94a3b8",
                fontSize: "11px",
                marginBottom: "4px",
              }}
            >
              TOKEN USAGE
            </div>
            <div
              style={{ fontSize: "18px", fontWeight: 600, color: "#38bdf8" }}
            >
              {snapshot.tokens.totalTokens.toLocaleString()}
            </div>
            <div
              style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}
            >
              In: {snapshot.tokens.inputTokens.toLocaleString()} · Out:{" "}
              {snapshot.tokens.outputTokens.toLocaleString()}
            </div>
            <div
              style={{
                marginTop: "8px",
                background: "#334155",
                borderRadius: "3px",
                height: "4px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${contextUsagePercent}%`,
                  background: "#38bdf8",
                  height: "100%",
                }}
              />
            </div>
            <div
              style={{ fontSize: "10px", color: "#94a3b8", marginTop: "3px" }}
            >
              Context Window: {contextUsagePercent}%
            </div>
          </div>

          {/* Card 2: Estimated Cost */}
          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              padding: "12px",
              borderRadius: "6px",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div
              style={{
                color: "#94a3b8",
                fontSize: "11px",
                marginBottom: "4px",
              }}
            >
              ESTIMATED COST
            </div>
            <div
              style={{ fontSize: "18px", fontWeight: 600, color: "#4ade80" }}
            >
              ${snapshot.estimatedCostUSD.toFixed(4)}
            </div>
            <div
              style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}
            >
              Cached Tokens: {snapshot.tokens.cachedTokens.toLocaleString()}
            </div>
            <div
              style={{ fontSize: "10px", color: "#22c55e", marginTop: "8px" }}
            >
              Discount applied for cached prompts
            </div>
          </div>

          {/* Card 3: Memory Queue & Concurrency */}
          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              padding: "12px",
              borderRadius: "6px",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div
              style={{
                color: "#94a3b8",
                fontSize: "11px",
                marginBottom: "4px",
              }}
            >
              SCHEDULER & QUEUE
            </div>
            <div style={{ fontSize: "14px", fontWeight: 500 }}>
              Queue Backlog:{" "}
              <span style={{ color: "#facc15" }}>
                {snapshot.systemStatus.memoryQueueDepth}
              </span>
            </div>
            <div
              style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}
            >
              Active Workers: {snapshot.systemStatus.activeWorkers} · Idle:{" "}
              {snapshot.systemStatus.idleWorkers}
            </div>
          </div>

          {/* Card 4: Pending Approvals */}
          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              padding: "12px",
              borderRadius: "6px",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div
              style={{
                color: "#94a3b8",
                fontSize: "11px",
                marginBottom: "4px",
              }}
            >
              GOVERNANCE & APPROVALS
            </div>
            <div style={{ fontSize: "14px", fontWeight: 500 }}>
              Pending Approvals:{" "}
              <span
                style={{
                  color:
                    snapshot.systemStatus.pendingApprovalsCount > 0
                      ? "#f87171"
                      : "#4ade80",
                }}
              >
                {snapshot.systemStatus.pendingApprovalsCount}
              </span>
            </div>
            <div
              style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}
            >
              Retries Encountered: {snapshot.retryIncidents.length}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Tool Latencies */}
      {activeTab === "tools" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr 1fr",
              color: "#64748b",
              fontSize: "11px",
              paddingBottom: "4px",
              borderBottom: "1px solid #1e293b",
            }}
          >
            <span>TOOL NAME</span>
            <span style={{ textAlign: "right" }}>CALLS</span>
            <span style={{ textAlign: "right" }}>AVG (ms)</span>
            <span style={{ textAlign: "right" }}>P95 (ms)</span>
          </div>
          {snapshot.toolLatencies.length === 0 ? (
            <div
              style={{
                padding: "16px 0",
                textAlign: "center",
                color: "#64748b",
              }}
            >
              No tool calls recorded in this session yet.
            </div>
          ) : (
            snapshot.toolLatencies.map((tool) => (
              <div
                key={tool.toolName}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr 1fr",
                  fontSize: "12px",
                  padding: "4px 0",
                  fontFamily: "ui-monospace, monospace",
                }}
              >
                <span
                  style={{
                    color: "#38bdf8",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {tool.toolName}
                </span>
                <span style={{ textAlign: "right", color: "#e2e8f0" }}>
                  {tool.callCount}
                </span>
                <span style={{ textAlign: "right", color: "#94a3b8" }}>
                  {tool.avgDurationMs}ms
                </span>
                <span
                  style={{
                    textAlign: "right",
                    color: tool.p95DurationMs > 2000 ? "#f87171" : "#4ade80",
                  }}
                >
                  {tool.p95DurationMs}ms
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 3: Resilience & Retries */}
      {activeTab === "resilience" && (
        <div>
          {snapshot.retryIncidents.length === 0 ? (
            <div
              style={{
                padding: "20px 0",
                textAlign: "center",
                color: "#4ade80",
              }}
            >
              ✓ No retry incidents or disconnects recorded. Session is healthy.
            </div>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              {snapshot.retryIncidents.map((incident) => (
                <div
                  key={incident.id}
                  style={{
                    background: "rgba(239, 68, 68, 0.08)",
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                    borderRadius: "6px",
                    padding: "8px 12px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "11px",
                      color: "#f87171",
                      fontWeight: 600,
                    }}
                  >
                    <span>{incident.category.toUpperCase()}</span>
                    <span>
                      {new Date(incident.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      marginTop: "4px",
                      color: "#cbd5e1",
                    }}
                  >
                    {incident.message}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
