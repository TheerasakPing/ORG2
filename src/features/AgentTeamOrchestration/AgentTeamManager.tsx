import React, { useState } from "react";

import { TEAM_ROLE_REGISTRY } from "./budgetGovernor";
import type { AgentRoleKind, BudgetStatus, TeamMember } from "./types";

interface AgentTeamManagerProps {
  teamMembers: TeamMember[];
  budgetStatus: BudgetStatus;
  onUpdateRole?: (memberId: string, newRole: AgentRoleKind) => void;
  onClose?: () => void;
}

export const AgentTeamManager: React.FC<AgentTeamManagerProps> = ({
  teamMembers,
  budgetStatus,
  onUpdateRole,
  onClose,
}) => {
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(
    teamMembers[0]?.id || null
  );

  const selectedMember = teamMembers.find((m) => m.id === selectedMemberId);
  const selectedRoleDesc = selectedMember
    ? TEAM_ROLE_REGISTRY[selectedMember.role]
    : null;

  return (
    <div
      data-testid="agent-team-manager"
      style={{
        display: "flex",
        flexDirection: "column",
        background: "var(--color-bg-subtle, #141416)",
        border: "1px solid var(--color-border-subtle, #2a2a2e)",
        borderRadius: "8px",
        padding: "16px",
        color: "#e2e8f0",
        fontSize: "13px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        maxWidth: "650px",
        width: "100%",
        boxShadow: "0 10px 25px rgba(0,0,0,0.4)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "14px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "16px" }}>👥</span>
          <span style={{ fontWeight: 600, fontSize: "14px" }}>
            Agent-Team Orchestration
          </span>
          <span
            style={{
              fontSize: "11px",
              padding: "2px 6px",
              borderRadius: "4px",
              background: budgetStatus.withinBudget
                ? "rgba(34, 197, 94, 0.15)"
                : "rgba(239, 68, 68, 0.15)",
              color: budgetStatus.withinBudget ? "#4ade80" : "#f87171",
              fontWeight: 500,
            }}
          >
            {budgetStatus.withinBudget
              ? `${budgetStatus.percentageUsed}% Budget Used`
              : "Budget Blocked"}
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              fontSize: "16px",
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Warning banner if near limit */}
      {budgetStatus.nearLimitWarning && (
        <div
          style={{
            background: "rgba(234, 179, 8, 0.1)",
            border: "1px solid rgba(234, 179, 8, 0.3)",
            borderRadius: "6px",
            padding: "8px 12px",
            fontSize: "12px",
            color: "#fde047",
            marginBottom: "12px",
          }}
        >
          ⚠️ Budget Warning:{" "}
          {budgetStatus.blockedReason ||
            `Session has reached ${budgetStatus.percentageUsed}% of allocated budget limit.`}
        </div>
      )}

      {/* Main Grid: Member List & Role Capabilities */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1.2fr",
          gap: "12px",
        }}
      >
        {/* Left: Member List */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
            TEAM MEMBERS
          </div>
          {teamMembers.map((member) => {
            const isSelected = member.id === selectedMemberId;
            return (
              <div
                key={member.id}
                onClick={() => setSelectedMemberId(member.id)}
                style={{
                  background: isSelected
                    ? "rgba(59, 130, 246, 0.15)"
                    : "rgba(255, 255, 255, 0.03)",
                  border: `1px solid ${isSelected ? "#3b82f6" : "#27272a"}`,
                  borderRadius: "6px",
                  padding: "8px 10px",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontWeight: 600, color: "#f8fafc" }}>
                    {member.name}
                  </span>
                  <span
                    style={{
                      fontSize: "10px",
                      padding: "1px 5px",
                      borderRadius: "3px",
                      background: "#1e293b",
                      color: "#94a3b8",
                      textTransform: "uppercase",
                    }}
                  >
                    {member.role}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "#64748b",
                    marginTop: "2px",
                  }}
                >
                  {member.model} ·{" "}
                  <span
                    style={{
                      color:
                        member.status === "working" ? "#38bdf8" : "#94a3b8",
                    }}
                  >
                    {member.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Role Details & Permissions */}
        {selectedMember && selectedRoleDesc && (
          <div
            style={{
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid #27272a",
              borderRadius: "6px",
              padding: "12px",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                color: "#64748b",
                fontWeight: 600,
                marginBottom: "6px",
              }}
            >
              ROLE CAPABILITY MATRIX
            </div>
            <div
              style={{ fontSize: "13px", fontWeight: 600, color: "#38bdf8" }}
            >
              {selectedRoleDesc.name}
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "#94a3b8",
                margin: "4px 0 10px 0",
                lineHeight: 1.4,
              }}
            >
              {selectedRoleDesc.description}
            </div>

            <div
              style={{
                fontSize: "11px",
                color: "#64748b",
                marginBottom: "4px",
              }}
            >
              PERMITTED TOOL CATEGORIES:
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "4px",
                marginBottom: "12px",
              }}
            >
              {selectedRoleDesc.allowedToolCategories.map((cat) => (
                <span
                  key={cat}
                  style={{
                    background: "rgba(34, 197, 94, 0.12)",
                    border: "1px solid rgba(34, 197, 94, 0.3)",
                    color: "#4ade80",
                    fontSize: "10px",
                    fontWeight: 600,
                    borderRadius: "4px",
                    padding: "2px 6px",
                  }}
                >
                  ✓ {cat}
                </span>
              ))}
            </div>

            {/* Change Role Selector */}
            {onUpdateRole && (
              <div>
                <label
                  style={{
                    fontSize: "11px",
                    color: "#64748b",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  REASSIGN ROLE:
                </label>
                <select
                  value={selectedMember.role}
                  onChange={(e) =>
                    onUpdateRole(
                      selectedMember.id,
                      e.target.value as AgentRoleKind
                    )
                  }
                  style={{
                    width: "100%",
                    background: "#09090b",
                    border: "1px solid #3f3f46",
                    color: "#f4f4f5",
                    padding: "6px 8px",
                    borderRadius: "4px",
                    fontSize: "12px",
                  }}
                >
                  {Object.values(TEAM_ROLE_REGISTRY).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
