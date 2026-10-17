import React from "react";

import type { NativeWorkerOverview } from "@src/api/tauri/rpc/schemas/sessionAggregate";

import { useNativeWorkerOverview } from "./useNativeWorkerOverview";

function Metric({ label, value, caution = false }: {
  label: string;
  value: number | undefined;
  caution?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border-1 bg-bg-1 p-2 text-center">
      <div className={"text-lg font-bold " +
        (caution && value ? "text-amber-600" : "text-text-1")}>
        {value ?? "—"}
      </div>
      <div className="text-[10px] leading-tight text-text-3">{label}</div>
    </div>
  );
}

function Breakdown({ overview }: { overview: NativeWorkerOverview | null }) {
  return (
    <>
      <div className="mt-3 grid grid-cols-3 gap-2" data-testid="native-worker-counters">
        <Metric label="Workers created" value={overview?.initializedWorkers} />
        <Metric label="Running jobs" value={overview?.busyWorkers} />
        <Metric label="Idle Workers" value={overview?.idleWorkers} />
        <Metric label="Queued jobs" value={overview?.queuedJobs} />
        <Metric label="Dead / closed" value={overview?.terminatedWorkers} caution />
        <Metric label="Not started" value={overview?.neverStarted} />
      </div>
      <p className="mt-2 text-[11px] text-text-3">
        Registered sessions: {overview?.registeredSessions ?? "—"}
        {" · "}Live workers: {overview?.liveWorkers ?? "—"}
        {" · "}Active Turns: {overview?.activeTurnWorkers ?? "—"}
        {" · "}Maintenance: {overview?.maintenanceWorkers ?? "—"}
      </p>
    </>
  );
}

export function NativeWorkerOverviewSection(): React.ReactElement {
  const { overview, isLoading, error, refresh } = useNativeWorkerOverview();

  return (
    <section aria-label="Native Rust Worker Overview"
      data-testid="native-worker-overview"
      className="mb-4 rounded-xl border border-border-2 bg-bg-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-text-1">Worker Overview</h3>
          <p className="text-[11px] text-text-3">Rust Scheduler · ตัวเลข Runtime จริง</p>
        </div>
        <button type="button" onClick={() => void refresh()}
          disabled={isLoading} aria-label="Refresh native worker overview"
          className="rounded-md border border-border-2 px-2 py-1 text-[11px] text-text-2 hover:bg-fill-1 disabled:opacity-50">
          {isLoading ? "Loading…" : "↻ Refresh"}
        </button>
      </div>
      <Breakdown overview={overview} />
      {error && (
        <p role="alert" className="mt-2 text-[11px] text-amber-600">
          อ่านสถานะ Worker ไม่สำเร็จ · แสดงผลครั้งก่อน (ถ้ามี)
        </p>
      )}
      <p className="mt-2 text-[10px] leading-relaxed text-text-3">
        นับ Worker ที่สร้างจริงจาก Session ในหน่วยความจำ ไม่ใช่จำนวน
        Session ทั้งหมด · ไม่รวม CLI Subagents, Cloud Workers หรือ OS Threads.
        ข้อมูล Snapshot อ่านอย่างเดียว และอาจเปลี่ยนระหว่างการอ่าน
      </p>
    </section>
  );
}
