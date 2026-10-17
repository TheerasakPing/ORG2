/**
 * Passive advisory classifier. Phase events are transitions, not heartbeat
 * signals, so this module never declares a hung process or triggers recovery.
 */
import type { NativePhaseMap } from "./nativePhaseEvents";

export const PHASE_SILENCE_WARNING_MS = 5 * 60 * 1000;
export const PHASE_OBSERVATION_EXPIRY_MS = 60 * 60 * 1000;

export type PhaseAdvisory = "recent" | "quiet" | "expired" | "unavailable";

export interface PhaseAdvisoryView {
  state: PhaseAdvisory;
  elapsedMs: number | null;
  message: string;
}

export function phaseAdvisory(
  sessionId: string,
  phases: NativePhaseMap,
  nowMs: number
): PhaseAdvisoryView {
  const entry = phases.get(sessionId);
  if (!entry || !Number.isFinite(nowMs) || nowMs < 0) {
    return {
      state: "unavailable",
      elapsedMs: null,
      message: "ไม่มีข้อมูลความคืบหน้าของ Turn ที่เปิดดู · No observed phase",
    };
  }
  const delta = nowMs - entry.observedAtMs;
  // Future/invalid timestamps cannot be used to claim current activity.
  if (!Number.isFinite(delta) || delta < 0) {
    return {
      state: "unavailable",
      elapsedMs: null,
      message: "เวลา Event ไม่ถูกต้อง · Timing unavailable",
    };
  }
  if (delta >= PHASE_OBSERVATION_EXPIRY_MS) {
    return {
      state: "expired",
      elapsedMs: delta,
      message: "ไม่พบ Event ขั้นตอนใหม่เป็นเวลานาน · ตรวจสอบ Logs และสถานะ Runtime",
    };
  }
  if (delta >= PHASE_SILENCE_WARNING_MS) {
    return {
      state: "quiet",
      elapsedMs: delta,
      message: "ไม่มีการเปลี่ยนขั้นตอนช่วงหนึ่ง · อาจรอ Provider หรือ Tool ตามปกติ",
    };
  }
  return {
    state: "recent",
    elapsedMs: delta,
    message: "เพิ่งพบ Event เปลี่ยนขั้นตอน · ไม่ใช่การรับรองว่า Agent ยังทำงาน",
  };
}

/** Advisory counts are based on observed phases only, never roster updated_at. */
export function countQuietSessions(
  sessionIds: readonly string[],
  phases: NativePhaseMap,
  nowMs: number
): { quiet: number; expired: number; observed: number } {
  let quiet = 0;
  let expired = 0;
  let observed = 0;
  const unique = new Set(sessionIds);
  for (const id of unique) {
    const result = phaseAdvisory(id, phases, nowMs);
    if (result.state === "unavailable") continue;
    observed++;
    if (result.state === "quiet") quiet++;
    if (result.state === "expired") expired++;
  }
  return { quiet, expired, observed };
}
