/**
 * Observational warnings only. Time without output != a stuck Rust future.
 * This pure function cannot cancel, retry, or modify any session.
 */
import type { NativePhaseObservation } from "./nativePhaseEvents";

export const PROVIDER_FIRST_OUTPUT_ADVISORY_MS = 90_000;
export const PROVIDER_OUTPUT_GAP_ADVISORY_MS = 120_000;
export const TOOL_RESULT_ADVISORY_MS = 300_000;

export interface ProgressAssessment {
  level: "observed" | "quiet" | "unknown";
  warning: string | null;
  /** Milliseconds since the last *observed* boundary or provider delta. */
  ageMs: number | null;
}

export function assessNativeProgress(
  entry: NativePhaseObservation | undefined,
  nowMs: number
): ProgressAssessment {
  if (!entry || !Number.isFinite(nowMs) || nowMs < entry.observedAtMs) {
    return { level: "unknown", warning: null, ageMs: null };
  }
  if (entry.phase === "tool_finished") {
    return { level: "observed", warning: null, ageMs: 0 };
  }
  const last = entry.phase === "provider_request"
    ? entry.lastProgressAtMs ?? entry.observedAtMs
    : entry.observedAtMs;
  if (nowMs < last) return { level: "unknown", warning: null, ageMs: null };
  const ageMs = nowMs - last;
  const threshold = entry.phase === "tool_executing"
    ? TOOL_RESULT_ADVISORY_MS
    : entry.lastProgressAtMs === null
      ? PROVIDER_FIRST_OUTPUT_ADVISORY_MS
      : PROVIDER_OUTPUT_GAP_ADVISORY_MS;
  if (ageMs < threshold) {
    return { level: "observed", warning: null, ageMs };
  }
  if (entry.phase === "tool_executing") {
    return {
      level: "quiet", ageMs,
      warning: "ยังไม่ได้รับผล Tool เกิน 5 นาที · อาจเป็นงานที่ใช้เวลานาน",
    };
  }
  return {
    level: "quiet", ageMs,
    warning: entry.lastProgressAtMs === null
      ? "ยังไม่มีข้อมูลตอบกลับจาก Provider เกิน 90 วินาที · อาจเป็นการตอบช้า"
      : "ไม่พบ Provider delta เพิ่มเกิน 2 นาที · ยังไม่ยืนยันว่า Agent ค้าง",
  };
}
