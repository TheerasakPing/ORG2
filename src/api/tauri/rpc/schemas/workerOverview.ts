import { z } from "zod/v4";

/** Counts returned by the in-memory native Rust DialogScheduler registry.
 * This schema is intentionally standalone so its pure unit tests don't
 * import the aggregate session/history DTO dependency graph.
 */
export const NativeWorkerOverviewSchema = z
  .object({
    registeredSessions: z.number().int().nonnegative(),
    neverStarted: z.number().int().nonnegative(),
    initializedWorkers: z.number().int().nonnegative(),
    liveWorkers: z.number().int().nonnegative(),
    busyWorkers: z.number().int().nonnegative(),
    activeTurnWorkers: z.number().int().nonnegative(),
    maintenanceWorkers: z.number().int().nonnegative(),
    idleWorkers: z.number().int().nonnegative(),
    terminatedWorkers: z.number().int().nonnegative(),
    queuedJobs: z.number().int().nonnegative(),
  })
  .strict();

export type NativeWorkerOverview = z.infer<typeof NativeWorkerOverviewSchema>;
