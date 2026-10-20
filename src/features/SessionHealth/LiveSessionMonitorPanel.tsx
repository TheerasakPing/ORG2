/**
 * Lightweight, read-only live session monitor. The view subscribes to existing
 * pushed session states only while open; it never starts background polling.
 */
import { useAtomValue } from "jotai";
import React, { useEffect, useMemo, useState } from "react";

import { useTauriListen } from "@src/hooks/platform/useTauriListen";
import { loadSessionRoster, sessionsAtom } from "@src/store/session";
import { agentLiveStatusAtom } from "@src/store/session/agentLiveStatusAtom";

import { NativeWorkerOverviewSection } from "./NativeWorkerOverviewSection";
import {
  type LiveSessionRow,
  deriveLiveSessionSummary,
} from "./liveSessionMonitorModel";
import {
  NATIVE_PHASE_EVENT,
  NATIVE_PROGRESS_EVENT,
  type NativePhaseMap,
  clearNativePhase,
  ingestNativePhase,
  ingestNativeProgress,
} from "./nativePhaseEvents";
import {
  SCHEDULER_HEARTBEAT_EVENT,
  type SchedulerPulseMap,
  countSchedulerPulseHealth,
  ingestSchedulerPulse,
  schedulerPulseHealth,
  schedulerPulseMessage,
} from "./schedulerHeartbeat";
import { countQuietSessions, phaseAdvisory } from "./sessionStallAdvisory";

interface LiveSessionMonitorPanelProps {
  onClose: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  running: "กำลังทำงาน / Running",
  in_progress: "กำลังทำงาน / In progress",
  installing: "ติดตั้ง / Installing",
  pending: "รอเริ่ม / Pending",
  queued: "อยู่ในคิว / Queued",
  waiting_for_funds: "รอเครดิต / Waiting for funds",
  waiting_for_user: "รอผู้ใช้ / Needs input",
  paused: "พัก / Paused",
  idle: "ว่าง / Idle",
  completed: "เสร็จ / Completed",
  failed: "ผิดพลาด / Failed",
  error: "ผิดพลาด / Error",
  cancelled: "ยกเลิก / Cancelled",
  abandoned: "ขัดจังหวะ / Abandoned",
  timeout: "หมดเวลา / Timeout",
  killed: "หยุด / Killed",
  archived: "เก็บแล้ว / Archived",
};

function StatusRow({
  row,
  caution,
  workerPulseNote,
  workerPulseAlert,
}: {
  row: LiveSessionRow;
  caution: string | null;
  workerPulseNote: string | null;
  workerPulseAlert: boolean;
}) {
  const color =
    row.phase === "working"
      ? "bg-gradient-to-r from-cyan-400 to-teal-300 shadow-[0_0_10px_rgba(34,211,238,0.9)] ring-2 ring-cyan-400/50 animate-pulse"
      : row.phase === "attention"
        ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]"
        : row.phase === "terminal"
          ? "bg-slate-400"
          : "bg-slate-300";
  return (
    <li
      className="rounded-xl border border-border-1 bg-bg-1 p-3"
      data-testid="live-session-row"
    >
      <div className="flex min-w-0 items-start gap-2">
        <span
          aria-hidden
          className={"mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full " + color}
        />
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-[13px] font-semibold text-text-1"
            title={row.title}
          >
            {row.title}
          </p>
          <p className="text-xs text-text-2">
            {STATUS_LABELS[row.status] ?? "ไม่ทราบสถานะ / Unknown"}
          </p>
          <p className="mt-1 text-[11px] break-words text-text-3">
            {row.detail}
          </p>
          {row.quietWarning && (
            <p className="mt-1 text-[11px] text-amber-600" role="status">
              ⚠ {row.quietWarning}
            </p>
          )}
          {caution && (
            <p className="mt-1 text-[11px] text-amber-600">{caution}</p>
          )}
          {workerPulseNote && (
            <p
              className={`mt-1 text-[11px] ${workerPulseAlert ? "text-amber-600" : "text-text-3"}`}
            >
              {workerPulseNote}
            </p>
          )}
          {row.oldPersistedStatus && (
            <p className="mt-1 text-[11px] text-amber-600">
              ข้อมูลสถานะในฐานข้อมูลเก่ากว่า 10 นาที · ตรวจสอบเพิ่มเติม
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

export default function LiveSessionMonitorPanel({
  onClose,
}: LiveSessionMonitorPanelProps) {
  const sessions = useAtomValue(sessionsAtom);
  const hookStatuses = useAtomValue(agentLiveStatusAtom);
  const [activeOnly, setActiveOnly] = useState(true);
  const [nowMs, setNowMs] = useState(Date.now);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [workerRefreshSignal, setWorkerRefreshSignal] = useState(0);
  const [nativePhases, setNativePhases] = useState<NativePhaseMap>(
    () => new Map()
  );

  const [schedulerPulses, setSchedulerPulses] = useState<SchedulerPulseMap>(
    () => new Map()
  );

  // Five low-volume Tauri event subscriptions only while expanded.
  // Payloads are validated and minimized before state ingestion. Never
  // subscribe to high-frequency message or thinking delta streams here.
  useTauriListen<unknown>(SCHEDULER_HEARTBEAT_EVENT, (payload) => {
    setSchedulerPulses((previous) => ingestSchedulerPulse(previous, payload));
  });
  useTauriListen<unknown>(NATIVE_PHASE_EVENT, (payload) => {
    setNativePhases((previous) => ingestNativePhase(previous, payload));
  });
  useTauriListen<unknown>(NATIVE_PROGRESS_EVENT, (payload) => {
    setNativePhases((previous) => ingestNativeProgress(previous, payload));
  });
  useTauriListen<unknown>("agent:complete", (payload) => {
    setNativePhases((previous) => clearNativePhase(previous, payload));
  });
  useTauriListen<unknown>("agent:error", (payload) => {
    setNativePhases((previous) => clearNativePhase(previous, payload));
  });

  // Age labels are only recalculated while the panel is open and the window
  // is visible; closing unmounts this panel and clears its sole interval.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden") setNowMs(Date.now());
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const summary = useMemo(
    () =>
      deriveLiveSessionSummary(sessions, hookStatuses, {
        activeOnly,
        nowMs,
        nativePhases,
      }),
    [sessions, hookStatuses, activeOnly, nowMs, nativePhases]
  );

  const quietCounts = useMemo(() => {
    const activeNativeIds = summary.rows
      .filter((row) => row.phase === "working" && row.source === "native-phase")
      .map((row) => row.id);
    return countQuietSessions(activeNativeIds, nativePhases, nowMs);
  }, [summary.rows, nativePhases, nowMs]);

  const workerPulseCounts = useMemo(() => {
    const localActiveIds = summary.rows
      .filter((row) => row.phase === "working" && row.source !== "cli-hook")
      .map((row) => row.id);
    return countSchedulerPulseHealth(localActiveIds, schedulerPulses, nowMs);
  }, [summary.rows, schedulerPulses, nowMs]);

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshError(false);
    setWorkerRefreshSignal((previous) => previous + 1);
    try {
      // Explicit only: joined with the app's single-flight roster loader.
      await loadSessionRoster({ forceRefresh: true });
    } catch {
      setRefreshError(true);
    } finally {
      setRefreshing(false);
      setNowMs(Date.now());
    }
  };

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-label="Live Session Monitor"
      data-testid="live-session-monitor-panel"
      className="absolute right-0 bottom-12 flex h-[min(72vh,610px)] w-[min(calc(100vw-24px),420px)] flex-col overflow-hidden rounded-2xl border border-border-2 bg-bg-2 text-text-1 shadow-2xl"
    >
      <header className="shrink-0 border-b border-border-1 px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="text-[10px] font-bold tracking-widest text-cyan-600 uppercase">
              TP Agent Studio
            </span>
            <h2 className="text-lg font-semibold">Live Session Monitor</h2>
            <p className="text-xs text-text-3">
              สถานะจากแอป · ไม่ใช่การตรวจจับ Hang โดยตรง
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-text-2 hover:bg-fill-2"
            aria-label="Close Session Monitor"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2">
          <div
            className={`rounded-xl p-2 text-center transition-all ${
              summary.busy > 0
                ? "border border-cyan-500/40 bg-cyan-500/10 text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.2)]"
                : "bg-fill-1"
            }`}
          >
            <div className="text-xl font-bold">{summary.busy}</div>
            <div
              className={`text-[10px] ${
                summary.busy > 0 ? "font-medium text-cyan-300" : "text-text-2"
              }`}
            >
              กำลังทำงาน
            </div>
          </div>
          <div className="rounded-xl bg-fill-1 p-2 text-center">
            <div className="text-xl font-bold">{summary.attention}</div>
            <div className="text-[10px] text-text-2">รอผู้ใช้ / Paused</div>
          </div>
          <div className="rounded-xl bg-fill-1 p-2 text-center">
            <div className="text-xl font-bold">{summary.quietSignals}</div>
            <div className="text-[10px] text-text-2">สัญญาณเงียบ</div>
          </div>
          <div className="rounded-xl bg-fill-1 p-2 text-center">
            <div className="text-xl font-bold">{summary.olderStatus}</div>
            <div className="text-[10px] text-text-2">ข้อมูลเก่า</div>
          </div>
        </div>
        <p
          className="mt-2 text-[11px] text-text-3"
          data-testid="session-monitor-silence-summary"
        >
          Phase silence: {quietCounts.quiet} quiet ≥5m · {quietCounts.expired}{" "}
          old ≥60m
          {" · "}Only {quietCounts.observed} observed native turns
        </p>
        <p
          className="mt-1 text-[11px] text-text-3"
          data-testid="session-monitor-worker-heartbeat-summary"
        >
          Scheduler heartbeat: {workerPulseCounts.recent} recent ·{" "}
          {workerPulseCounts.late} late ≥45s{" · "}
          {workerPulseCounts.missing} missing ≥2m{" · "}
          {workerPulseCounts.unknown} unobserved
        </p>
        <div className="mt-3 flex items-center justify-between gap-2 text-xs">
          <label className="flex items-center gap-2 text-text-2">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(event) => setActiveOnly(event.target.checked)}
            />
            เฉพาะที่กำลังทำงาน / Active
          </label>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="rounded-lg border border-border-2 px-3 py-1.5 font-semibold hover:bg-fill-1 disabled:opacity-50"
          >
            {refreshing ? "กำลังโหลด..." : "↻ Refresh"}
          </button>
        </div>
        {refreshError && (
          <p role="alert" className="mt-2 text-xs text-amber-600">
            รีเฟรชไม่สำเร็จ · แสดงข้อมูลเดิม
          </p>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <NativeWorkerOverviewSection refreshSignal={workerRefreshSignal} />
        <p className="mb-3 text-[11px] text-text-3">
          แสดง {summary.visibleCount} จาก {summary.totalLoaded} Session
          ในรายการที่โหลดแล้ว
          {summary.truncated ? " (จำกัดสูงสุด 50 รายการ)" : ""}
        </p>
        {summary.rows.length ? (
          <ul className="space-y-2">
            {summary.rows.map((row) => {
              const advisory =
                row.phase === "working" && row.source === "native-phase"
                  ? phaseAdvisory(row.id, nativePhases, nowMs)
                  : null;
              const caution =
                !row.quietWarning &&
                (advisory?.state === "quiet" || advisory?.state === "expired")
                  ? advisory.message
                  : null;
              const pulse =
                row.phase === "working" && row.source !== "cli-hook"
                  ? schedulerPulseHealth(schedulerPulses.get(row.id), nowMs)
                  : "unknown";
              const workerPulseNote =
                pulse === "unknown" ? null : schedulerPulseMessage(pulse);
              return (
                <StatusRow
                  row={row}
                  caution={caution}
                  workerPulseNote={workerPulseNote}
                  workerPulseAlert={pulse === "late" || pulse === "missing"}
                  key={row.id}
                />
              );
            })}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-border-2 p-6 text-center text-sm text-text-2">
            ไม่มี Session ในตัวกรองนี้
          </p>
        )}
      </div>
      <footer className="shrink-0 border-t border-border-1 px-4 py-3 text-[11px] text-text-3">
        <p>
          Rust Provider/Tool + Progress Pulse จริง · ส่งเฉพาะข้อมูลสถานะ
          ไม่ส่งเนื้อหา
        </p>
        <p>“สัญญาณเงียบ” ไม่เท่ากับ Hang · ไม่สั่งหยุดหรือรันงานซ้ำอัตโนมัติ</p>
      </footer>
    </section>
  );
}
