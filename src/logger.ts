type LogLevel = "debug" | "info" | "warn" | "error";

export function log(
  level: LogLevel,
  msg: string,
  data?: Record<string, unknown>,
) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(data ? { data } : {}),
  };
  // JSONL so it’s easy to grep and parse
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(entry));
}
