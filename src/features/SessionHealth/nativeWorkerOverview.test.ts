import { describe, expect, it } from "vitest";

import {
  NativeWorkerOverviewSchema,
  type NativeWorkerOverview,
} from "@src/api/tauri/rpc/schemas/sessionAggregate";

const empty: NativeWorkerOverview = {
  registeredSessions: 0,
  neverStarted: 0,
  initializedWorkers: 0,
  liveWorkers: 0,
  busyWorkers: 0,
  activeTurnWorkers: 0,
  maintenanceWorkers: 0,
  idleWorkers: 0,
  terminatedWorkers: 0,
  queuedJobs: 0,
};

describe("NativeWorkerOverview RPC contract", () => {
  it("accepts a zero-worker installation as a real zero snapshot", () => {
    expect(NativeWorkerOverviewSchema.parse(empty)).toEqual(empty);
  });

  it("never equates registered sessions with initialized workers", () => {
    const s: NativeWorkerOverview = {
      ...empty, registeredSessions: 20, neverStarted: 15,
      initializedWorkers: 5, liveWorkers: 4, busyWorkers: 2,
      activeTurnWorkers: 1, maintenanceWorkers: 1, idleWorkers: 2,
      terminatedWorkers: 1, queuedJobs: 9,
    };
    const parsed = NativeWorkerOverviewSchema.parse(s);
    expect(parsed.registeredSessions).toBe(20);
    expect(parsed.initializedWorkers).toBe(5);
    expect(parsed.liveWorkers).toBe(4);
    expect(parsed.queuedJobs).toBe(9);
  });

  it("rejects negative or fractional worker/queue counts", () => {
    for (const bad of [-1, 1.2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(NativeWorkerOverviewSchema.safeParse({
        ...empty, queuedJobs: bad,
      }).success).toBe(false);
    }
  });

  it("rejects incomplete snapshots rather than pretending missing fields are zero", () => {
    expect(NativeWorkerOverviewSchema.safeParse({
      registeredSessions: 1,
      initializedWorkers: 1,
    }).success).toBe(false);
  });

  it("rejects unexpected session identifiers or private metadata on the wire", () => {
    expect(NativeWorkerOverviewSchema.safeParse({
      ...empty, sessionId: "PRIVATE-ID", prompt: "SECRET PROMPT",
    }).success).toBe(false);
  });

  it("accepts maintenance-only workload without falsely counting an active agent turn", () => {
    const s = NativeWorkerOverviewSchema.parse({
      ...empty, registeredSessions: 1,
      initializedWorkers: 1, liveWorkers: 1,
      busyWorkers: 1, maintenanceWorkers: 1,
      activeTurnWorkers: 0,
    });
    expect(s.busyWorkers).toBe(1);
    expect(s.activeTurnWorkers).toBe(0);
  });
});
