import { randomUUID } from "node:crypto";
import { log } from "../logger";
import { FormVars } from "../workflow";

export type RunStatus = "queued" | "running" | "succeeded" | "failed";

export type RunRecord = {
  id: string;
  status: RunStatus;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  vars?: Partial<FormVars>;
  result?: any;
  error?: string;
};

export type RunRegistryOptions = {
  maxRuns: number;
  runTtlMs: number;
};

export class RunRegistry {
  readonly runs = new Map<string, RunRecord>();
  readonly waiters = new Map<string, Array<(r: RunRecord) => void>>();
  readonly queue: string[] = [];
  running = false;

  private readonly maxRuns: number;
  private readonly runTtlMs: number;

  constructor(opts: RunRegistryOptions) {
    this.maxRuns = opts.maxRuns;
    this.runTtlMs = opts.runTtlMs;
  }

  pruneRuns(now = Date.now()) {
    for (const [id, r] of this.runs.entries()) {
      if ((r.status === "succeeded" || r.status === "failed") && r.endedAt) {
        const age = now - Date.parse(r.endedAt);
        if (age > this.runTtlMs) this.runs.delete(id);
      }
    }

    if (this.runs.size <= this.maxRuns) return;

    const all = Array.from(this.runs.values()).sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
    );
    const extra = this.runs.size - this.maxRuns;
    for (let i = 0; i < extra; i++) this.runs.delete(all[i].id);
  }

  stats() {
    let waiterCount = 0;
    for (const arr of this.waiters.values()) waiterCount += arr.length;

    const byStatus = {
      queued: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
    } as Record<RunStatus, number>;
    for (const r of this.runs.values()) byStatus[r.status]++;

    return {
      runsSize: this.runs.size,
      waiterKeys: this.waiters.size,
      waiterCount,
      queueDepth: this.queue.length,
      running: this.running,
      byStatus,
    };
  }

  notifyWaiters(id: string, rec: RunRecord) {
    const w = this.waiters.get(id);
    if (!w) return;
    this.waiters.delete(id);
    for (const fn of w) fn(rec);

    log("debug", "waiters_notified", {
      runId: id,
      count: w.length,
      status: rec.status,
    });
  }

  enqueueRun(vars: Partial<FormVars>): RunRecord {
    const id = randomUUID();
    const rec: RunRecord = {
      id,
      status: "queued",
      createdAt: new Date().toISOString(),
      vars,
    };

    this.runs.set(id, rec);
    this.queue.push(id);

    log("info", "run_queued", { runId: id, queueDepth: this.queue.length });
    return rec;
  }

  waitForRun(id: string, timeoutMs: number): Promise<RunRecord> {
    const existing = this.runs.get(id);
    if (!existing) return Promise.reject(new Error("Unknown runId"));

    if (existing.status === "succeeded" || existing.status === "failed") {
      return Promise.resolve(existing);
    }

    return new Promise((resolve, reject) => {
      let t: NodeJS.Timeout | undefined;

      const wrappedResolve = (r: RunRecord) => {
        if (t) clearTimeout(t);
        resolve(r);
      };

      const arr = this.waiters.get(id) ?? [];
      arr.push(wrappedResolve);
      this.waiters.set(id, arr);

      t = setTimeout(() => {
        const cur = this.waiters.get(id) ?? [];
        const next = cur.filter((fn) => fn !== wrappedResolve);
        if (next.length) this.waiters.set(id, next);
        else this.waiters.delete(id);

        reject(new Error("Timed out waiting for run completion"));
      }, timeoutMs);
    });
  }
}
