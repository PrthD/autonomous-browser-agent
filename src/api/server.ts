import "dotenv-defaults/config";
import { randomUUID } from "node:crypto";
import http from "node:http";
import { URL } from "node:url";
import { log } from "../logger";
import { FormVars, runMedicalFormWorkflow } from "../workflow";

const API_BASE = process.env.API_BASE ?? "/api/v1";
const MAX_RUNS = Number(process.env.MAX_RUNS ?? 200);
const RUN_TTL_MS = Number(process.env.RUN_TTL_MS ?? 60 * 60 * 1000);

type RunStatus = "queued" | "running" | "succeeded" | "failed";

type RunRecord = {
  id: string;
  status: RunStatus;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  vars?: Partial<FormVars>;
  result?: any;
  error?: string;
};

const runs = new Map<string, RunRecord>();
const waiters = new Map<string, Array<(r: RunRecord) => void>>();

const queue: string[] = [];
let running = false;

function pruneRuns() {
  const now = Date.now();

  for (const [id, r] of runs.entries()) {
    if ((r.status === "succeeded" || r.status === "failed") && r.endedAt) {
      const age = now - Date.parse(r.endedAt);
      if (age > RUN_TTL_MS) runs.delete(id);
    }
  }

  if (runs.size <= MAX_RUNS) return;
  const all = Array.from(runs.values()).sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
  const extra = runs.size - MAX_RUNS;
  for (let i = 0; i < extra; i++) runs.delete(all[i].id);
}

setInterval(() => {
  pruneRuns();
  debugState("runs_pruned_tick");
}, 30_000).unref();

function stats() {
  let waiterCount = 0;
  for (const arr of waiters.values()) waiterCount += arr.length;

  const byStatus = { queued: 0, running: 0, succeeded: 0, failed: 0 } as Record<
    RunStatus,
    number
  >;
  for (const r of runs.values()) byStatus[r.status]++;

  return {
    runsSize: runs.size,
    waiterKeys: waiters.size,
    waiterCount,
    queueDepth: queue.length,
    running,
    byStatus,
  };
}

function debugState(event: string, extra: Record<string, unknown> = {}) {
  log("debug", event, { ...extra, state: stats() });
}

function notifyWaiters(id: string, rec: RunRecord) {
  const w = waiters.get(id);
  if (!w) return;
  waiters.delete(id);
  for (const fn of w) fn(rec);

  debugState("waiters_notified", {
    runId: id,
    count: w.length,
    status: rec.status,
  });
}

async function processQueue() {
  if (running) return;

  const nextId = queue.shift();

  if (!nextId) return;

  debugState("process_queue_dequeued", { nextId });

  const rec = runs.get(nextId);
  if (!rec) {
    debugState("process_queue_missing_run", { nextId });
    return;
  }

  running = true;
  rec.status = "running";
  rec.startedAt = new Date().toISOString();
  runs.set(nextId, rec);

  log("info", "run_started", { runId: rec.id });
  debugState("run_state_running", { runId: rec.id });

  try {
    const result = await runMedicalFormWorkflow(rec.vars ?? {}, {
      runId: rec.id,
    });
    rec.status = "succeeded";
    rec.result = result;
    rec.endedAt = new Date().toISOString();
    runs.set(nextId, rec);

    log("info", "run_succeeded", { runId: rec.id });

    notifyWaiters(rec.id, rec);
  } catch (err: any) {
    rec.status = "failed";
    rec.error = String(err?.message ?? err);
    rec.endedAt = new Date().toISOString();
    runs.set(nextId, rec);

    log("error", "run_failed", { runId: rec.id, err: rec.error });

    notifyWaiters(rec.id, rec);
  } finally {
    running = false;

    debugState("process_queue_idle", { finishedRunId: rec.id });

    void processQueue();
  }
}

function enqueueRun(vars: Partial<FormVars>): RunRecord {
  const id = randomUUID();
  const rec: RunRecord = {
    id,
    status: "queued",
    createdAt: new Date().toISOString(),
  };

  rec.vars = vars;

  runs.set(id, rec);
  queue.push(id);

  log("info", "run_queued", { runId: id, queueDepth: queue.length });
  debugState("run_enqueued", { runId: id });

  void processQueue();
  return rec;
}

function waitForRun(id: string, timeoutMs: number): Promise<RunRecord> {
  const existing = runs.get(id);
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

    const arr = waiters.get(id) ?? [];
    arr.push(wrappedResolve);
    waiters.set(id, arr);

    debugState("waiter_added", {
      runId: id,
      timeoutMs,
      waitersForRun: waiters.get(id)?.length ?? 0,
    });

    t = setTimeout(() => {
      const cur = waiters.get(id) ?? [];
      const next = cur.filter((fn) => fn !== wrappedResolve);
      if (next.length) waiters.set(id, next);
      else waiters.delete(id);

      debugState("waiter_timeout", {
        runId: id,
        timeoutMs,
        waitersForRunAfter: next.length,
      });

      reject(new Error("Timed out waiting for run completion"));
    }, timeoutMs);
  });
}

function readJson(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function send(res: http.ServerResponse, code: number, body: any) {
  const json = JSON.stringify(body);
  res.writeHead(code, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(json),
  });
  res.end(json);
}

function isString(x: any) {
  return typeof x === "string" && x.trim().length > 0;
}

function validateVars(input: any): Partial<FormVars> {
  if (!input || typeof input !== "object") return {};

  const out: any = {};
  const fields: Array<keyof FormVars> = [
    "firstName",
    "lastName",
    "dateOfBirth",
    "medicalId",
    "gender",
    "bloodType",
    "allergies",
    "currentMedications",
    "emergencyContactName",
    "emergencyContactPhone",
  ];

  for (const f of fields) {
    if (f in input) {
      if (!isString(input[f])) {
        throw new Error(
          `Invalid field "${String(f)}" (must be non-empty string)`,
        );
      }
      out[f] = String(input[f]).trim();
    }
  }
  return out;
}

export function startApiServer() {
  const port = Number(process.env.PORT ?? 3000);

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "", `http://${req.headers.host}`);
      const pathname = url.pathname;

      if (req.method === "GET" && pathname === `${API_BASE}/health`) {
        return send(res, 200, { ok: true });
      }

      if (req.method === "GET" && pathname.startsWith(`${API_BASE}/runs/`)) {
        const runId = pathname.slice(`${API_BASE}/runs/`.length).trim();
        const rec = runs.get(runId);
        if (!rec) return send(res, 404, { ok: false, error: "Unknown runId" });

        const { id, status, createdAt, startedAt, endedAt, result, error } =
          rec;
        return send(res, 200, {
          ok: true,
          run: { id, status, createdAt, startedAt, endedAt, result, error },
        });
      }

      if (req.method === "POST" && pathname === `${API_BASE}/run`) {
        const body = await readJson(req);
        const vars = validateVars(body?.vars ?? body);

        const rec = enqueueRun(vars);

        const wait = url.searchParams.get("wait");
        if (wait === "true" || wait === "1") {
          const timeoutMs = Number(url.searchParams.get("timeoutMs") ?? 60_000);
          const done = await waitForRun(rec.id, timeoutMs);

          const payload = {
            id: done.id,
            status: done.status,
            createdAt: done.createdAt,
            startedAt: done.startedAt,
            endedAt: done.endedAt,
            result: done.result,
            error: done.error,
          };

          const code = done.status === "succeeded" ? 200 : 500;
          return send(res, code, {
            ok: done.status === "succeeded",
            run: payload,
          });
        }

        return send(res, 202, { ok: true, runId: rec.id });
      }

      return send(res, 404, { ok: false, error: "Not found" });
    } catch (err: any) {
      log("error", "api_error", { err: String(err?.message ?? err) });
      return send(res, 400, { ok: false, error: String(err?.message ?? err) });
    }
  });

  server.listen(port, () => {
    log("info", "api_listening", { port });
  });

  return server;
}

if (require.main === module) {
  startApiServer();
}
