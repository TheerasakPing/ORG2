import { describe, expect, it } from "vitest";

import type { AgentLiveStatus } from "@src/api/tauri/rpc/schemas/agentOrgs";
import type { Session } from "@src/store/session/sessionAtom/types";

import {
  deriveLiveSessionSummary,
  MAX_LIVE_MONITOR_ROWS,
  monitorPhase,
} from "./liveSessionMonitorModel";

const NOW = Date.parse("2026-10-17T12:00:00Z");

function session(
  id: string,
  status: string,
  updated = "2026-10-17T11:59:00Z",
  other: Partial<Session> = {}
): Session {
  return {
    session_id: id, status, updated_at: updated,
    created_at: "2026-10-17T11:00:00Z", name: "Session " + id,
    ...other,
  };
}

function hook(id: string, status: string, extras: Partial<AgentLiveStatus> = {}): AgentLiveStatus {
  return {
    sessionId: id, source: "codex", status,
    isInterrupt: false, updatedAtMs: NOW,
    ...extras,
  };
}

describe("live session monitor presentation model", () => {
  it("uses exact backend hook status for CLI and never repeats mirrored IDs", () => {
    const live = hook("cli-1", "waiting_for_user", {
      orgiiSessionId: "local-1",
      toolName: "Read",
      toolInputPreview: "SECRET API TOKEN",
      interactivePrompt: "SECRET USER PROMPT",
    });
    const entries = new Map<string, AgentLiveStatus>([
      ["cli-1", live], ["local-1", live],
    ]);
    const summary = deriveLiveSessionSummary(
      [session("local-1", "running")], entries, { nowMs: NOW }
    );
    expect(summary.totalLoaded).toBe(1);
    expect(summary.attention).toBe(1);
    expect(summary.rows[0]?.status).toBe("waiting_for_user");
    expect(summary.rows[0]?.source).toBe("cli-hook");
    expect(JSON.stringify(summary)).not.toContain("SECRET");
    expect(summary.rows[0]?.detail).toContain("waiting for user");
  });

  it("exposes safe CLI tool identifier but never tool inputs or prompts", () => {
    const live = hook("cli-1", "running", {
      toolName: "functions.exec", toolInputPreview: "secret://key",
      interactivePrompt: "Do not leak",
    });
    const summary = deriveLiveSessionSummary(
      [session("cli-1", "running")], new Map([["cli-1", live]]), { nowMs: NOW }
    );
    expect(summary.rows[0]?.detail).toBe("CLI tool: functions.exec");
    expect(JSON.stringify(summary)).not.toContain("secret://key");
    expect(JSON.stringify(summary)).not.toContain("Do not leak");
    const unsafe = hook("cli-1", "running", { toolName: "Read TOKEN=secret" });
    expect(deriveLiveSessionSummary(
      [session("cli-1", "running")], new Map([["cli-1", unsafe]]), { nowMs: NOW }
    ).rows[0]?.detail).toContain("unspecified");
  });

  it("does not claim native provider/tool phase from roster status", () => {
    const summary = deriveLiveSessionSummary(
      [session("native", "running")], new Map(), { nowMs: NOW }
    );
    expect(summary.busy).toBe(1);
    expect(summary.rows[0]?.detail).toContain("step unknown");
    expect(summary.rows[0]?.source).toBe("session-roster");
  });

  it("calls an old persisted row a warning, never a proven hang", () => {
    const summary = deriveLiveSessionSummary(
      [
        session("old", "running", "2026-10-17T11:00:00Z"),
        session("fresh", "running"),
        session("future", "running", "2035-01-01T00:00:00Z"),
        session("invalid", "running", "not-a-date"),
      ], new Map(), { nowMs: NOW }
    );
    expect(summary.olderStatus).toBe(1);
    expect(summary.rows.find((r) => r.id === "old")?.oldPersistedStatus).toBe(true);
    expect(summary.rows.find((r) => r.id === "fresh")?.oldPersistedStatus).toBe(false);
    expect(summary.rows.find((r) => r.id === "future")?.updatedAtMs).toBeNull();
    expect(summary.rows.find((r) => r.id === "invalid")?.updatedAtMs).toBeNull();
    expect(JSON.stringify(summary)).not.toContain("hung");
  });

  it("separates terminal, idle and working filters", () => {
    const sessions = [
      session("active", "running"),
      session("complete", "completed"),
      session("idle", "idle"),
      session("wait", "waiting_for_user"),
    ];
    const active = deriveLiveSessionSummary(sessions, new Map(), { nowMs: NOW });
    expect(active.rows.map((r) => r.id)).toEqual(["active", "wait"]);
    expect(active.busy).toBe(1);
    expect(active.attention).toBe(1);
    const all = deriveLiveSessionSummary(sessions, new Map(), {
      activeOnly: false, nowMs: NOW,
    });
    expect(all.totalLoaded).toBe(4);
    expect(all.rows.map((r) => r.id)).toEqual([
      "active", "wait", "idle", "complete",
    ]);
  });

  it("does not treat shared/imported replay sessions as locally executable", () => {
    const sessions = [
      session("imported", "running", undefined, {
        importedFrom: {
          orgId: "org", sourceSessionId: "source", ownerMemberId: "member",
          epoch: 0, seq: 0, count: 0,
        },
      }),
      session("readonly", "running", undefined, { readOnly: true }),
      session("local", "running"),
    ];
    const summary = deriveLiveSessionSummary(sessions, new Map(), { nowMs: NOW });
    expect(summary.rows.map((r) => r.id)).toEqual(["local"]);
  });

  it("keeps the visible collection bounded to fifty rows", () => {
    const sessions = Array.from({ length: 100 }, (_, i) =>
      session("session-" + i, "running")
    );
    const result = deriveLiveSessionSummary(sessions, new Map(), { nowMs: NOW });
    expect(result.busy).toBe(100);
    expect(result.visibleCount).toBe(MAX_LIVE_MONITOR_ROWS);
    expect(result.totalLoaded).toBe(100);
    expect(result.rows).toHaveLength(50);
    expect(result.truncated).toBe(true);
    expect(deriveLiveSessionSummary(sessions, new Map(), {
      nowMs: NOW, maxRows: 5,
    }).rows).toHaveLength(5);
  });

  it("keeps unknown statuses unknown, never guesses a runtime phase", () => {
    expect(monitorPhase("provider_streaming")).toBe("unknown");
    const s = deriveLiveSessionSummary(
      [session("unknown", "provider_streaming")], new Map(),
      { nowMs: NOW, activeOnly: false }
    );
    expect(s.rows[0]?.phase).toBe("unknown");
    expect(s.busy).toBe(0);
    expect(s.attention).toBe(0);
  });

  it("never includes raw message content in projection", () => {
    const s = deriveLiveSessionSummary(
      [session("private-id", "running", undefined, {
        user_input: "VERY SECRET USER INPUT",
        error_message: "SECRET provider token",
      })],
      new Map(), { nowMs: NOW }
    );
    expect(JSON.stringify(s)).not.toContain("VERY SECRET USER INPUT");
    expect(JSON.stringify(s)).not.toContain("SECRET provider token");
  });
});
