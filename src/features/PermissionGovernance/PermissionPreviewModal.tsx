import React from "react";

import type { PermissionImpactAssessment } from "./types";

interface PermissionPreviewModalProps {
  assessment: PermissionImpactAssessment;
  onApprove: () => void;
  onReject: () => void;
}

export const PermissionPreviewModal: React.FC<PermissionPreviewModalProps> = ({
  assessment,
  onApprove,
  onReject,
}) => {
  const isCritical = assessment.riskLevel === "critical";
  const badgeColor = isCritical
    ? "#ef4444"
    : assessment.riskLevel === "high"
      ? "#f97316"
      : "#eab308";

  return (
    <div
      data-testid="permission-preview-modal"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: "var(--color-bg-base, #18181b)",
          border: `1px solid ${isCritical ? "rgba(239, 68, 68, 0.5)" : "rgba(249, 115, 22, 0.4)"}`,
          borderRadius: "10px",
          width: "90%",
          maxWidth: "520px",
          padding: "20px",
          boxShadow: "0 20px 30px rgba(0,0,0,0.6)",
          color: "#f4f4f5",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "14px",
          }}
        >
          <span style={{ fontSize: "20px" }}>{isCritical ? "🛑" : "⚠️"}</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: "15px" }}>
              Action Permission Required
            </div>
            <div style={{ fontSize: "12px", color: "#a1a1aa" }}>
              The agent is requesting to execute a potentially impact-bearing
              operation.
            </div>
          </div>
        </div>

        {/* Risk Badge */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "center",
            marginBottom: "12px",
          }}
        >
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              padding: "2px 8px",
              borderRadius: "4px",
              backgroundColor: `${badgeColor}22`,
              color: badgeColor,
              border: `1px solid ${badgeColor}55`,
            }}
          >
            {assessment.riskLevel} Risk
          </span>
          <span style={{ fontSize: "12px", color: "#a1a1aa" }}>
            Action: {assessment.actionType}
          </span>
        </div>

        {/* Command or Target */}
        <div
          style={{
            background: "#09090b",
            border: "1px solid #27272a",
            borderRadius: "6px",
            padding: "10px",
            fontFamily: "ui-monospace, monospace",
            fontSize: "12px",
            color: "#38bdf8",
            wordBreak: "break-all",
            maxHeight: "120px",
            overflowY: "auto",
            marginBottom: "14px",
          }}
        >
          {assessment.commandString || assessment.target}
        </div>

        {/* Reasons */}
        {assessment.reasons.length > 0 && (
          <div style={{ marginBottom: "16px" }}>
            <div
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "#a1a1aa",
                marginBottom: "4px",
              }}
            >
              SECURITY ASSESSMENT DETAILS:
            </div>
            <ul
              style={{
                margin: 0,
                paddingLeft: "18px",
                fontSize: "12px",
                color: "#fca5a5",
              }}
            >
              {assessment.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Buttons */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px",
            marginTop: "16px",
          }}
        >
          <button
            onClick={onReject}
            style={{
              background: "transparent",
              border: "1px solid #3f3f46",
              color: "#e4e4e7",
              borderRadius: "6px",
              padding: "6px 14px",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            Deny
          </button>
          <button
            onClick={onApprove}
            style={{
              background: isCritical ? "#dc2626" : "#ea580c",
              border: "none",
              color: "#ffffff",
              fontWeight: 600,
              borderRadius: "6px",
              padding: "6px 16px",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            Authorize Execution
          </button>
        </div>
      </div>
    </div>
  );
};
