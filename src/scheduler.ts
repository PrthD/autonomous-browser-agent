import "dotenv-defaults/config";
import { log } from "./logger";
import { runMedicalFormWorkflow } from "./workflow";

function envBool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

let running = false;

async function runOnce(trigger: string) {
  if (running) {
    log("warn", "schedule_skip_overlap", { trigger });
    return;
  }

  running = true;
  const startedAt = Date.now();

  try {
    log("info", "schedule_run_start", { trigger });
    const result = await runMedicalFormWorkflow();
    log("info", "schedule_run_ok", {
      trigger,
      ok: result.ok,
      reason: result.reason,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    log("error", "schedule_run_error", {
      trigger,
      err: String(err),
      durationMs: Date.now() - startedAt,
    });
  } finally {
    running = false;
  }
}

export function startScheduler() {
  const intervalMs = Number(
    process.env.SCHEDULE_INTERVAL_MS ?? DEFAULT_INTERVAL_MS,
  );
  const runOnStart = envBool("SCHEDULE_RUN_ON_START", true);

  if (!Number.isFinite(intervalMs) || intervalMs < 10_000) {
    throw new Error(
      `Invalid SCHEDULE_INTERVAL_MS=${process.env.SCHEDULE_INTERVAL_MS} (must be >= 10000)`,
    );
  }

  log("info", "scheduler_started", { intervalMs, runOnStart });

  if (runOnStart) {
    void runOnce("startup");
  }

  setInterval(() => {
    void runOnce("interval");
  }, intervalMs);
}

if (require.main === module) {
  startScheduler();
}
