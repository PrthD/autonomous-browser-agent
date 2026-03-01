import "dotenv-defaults/config";
import http from "node:http";
import { URL } from "node:url";
import { log } from "../logger";
import { FormVars, runMedicalFormWorkflow } from "../workflow";
import { RunRecord, RunRegistry } from "./registry";

const API_BASE = process.env.API_BASE ?? "/api/v1";
const MAX_RUNS = Number(process.env.MAX_RUNS ?? 200);
const RUN_TTL_MS = Number(process.env.RUN_TTL_MS ?? 60 * 60 * 1000);

export { RunRecord, RunRegistry };

export function createRegistry() {
  return new RunRegistry({ maxRuns: MAX_RUNS, runTtlMs: RUN_TTL_MS });
}

const defaultRegistry = createRegistry();

setInterval(() => {
  defaultRegistry.pruneRuns();
  log("debug", "runs_pruned_tick", { state: defaultRegistry.stats() });
}, 30_000).unref();

export async function processQueue(
  registry: RunRegistry,
  workflowFn: typeof runMedicalFormWorkflow = runMedicalFormWorkflow,
) {
  if (registry.running) return;

  const nextId = registry.queue.shift();
  if (!nextId) return;

  const rec = registry.runs.get(nextId);
  if (!rec) return;

  registry.running = true;
  rec.status = "running";
  rec.startedAt = new Date().toISOString();
  registry.runs.set(nextId, rec);

  log("info", "run_started", { runId: rec.id });

  try {
    const result = await workflowFn(rec.vars ?? {}, { runId: rec.id });
    rec.status = "succeeded";
    rec.result = result;
    rec.endedAt = new Date().toISOString();
    registry.runs.set(nextId, rec);

    log("info", "run_succeeded", { runId: rec.id });
    registry.notifyWaiters(rec.id, rec);
  } catch (err: any) {
    rec.status = "failed";
    rec.error = String(err?.message ?? err);
    rec.endedAt = new Date().toISOString();
    registry.runs.set(nextId, rec);

    log("error", "run_failed", { runId: rec.id, err: rec.error });
    registry.notifyWaiters(rec.id, rec);
  } finally {
    registry.running = false;
    void processQueue(registry, workflowFn);
  }
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

export function startApiServer(
  registry: RunRegistry = defaultRegistry,
  workflowFn: typeof runMedicalFormWorkflow = runMedicalFormWorkflow,
) {
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
        const rec = registry.runs.get(runId);
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

        const rec = registry.enqueueRun(vars);
        void processQueue(registry, workflowFn);

        const wait = url.searchParams.get("wait");
        if (wait === "true" || wait === "1") {
          const timeoutMs = Number(url.searchParams.get("timeoutMs") ?? 60_000);
          const done = await registry.waitForRun(rec.id, timeoutMs);

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
