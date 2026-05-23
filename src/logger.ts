type Level = "info" | "warn" | "error";
type LogHook = (line: string) => void;

let _hook: LogHook | null = null;

export function setLogHook(fn: LogHook | null): void {
  _hook = fn;
}

function emit(level: Level, msg: string, extra?: Record<string, unknown>): void {
  const line = JSON.stringify({ ...extra, level, msg, timestamp: new Date().toISOString() }) + "\n";
  _hook?.(line);
  if (level === "error" || level === "warn") {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
}

export const log = {
  info(msg: string, extra?: Record<string, unknown>): void {
    emit("info", msg, extra);
  },
  warn(msg: string, extra?: Record<string, unknown>): void {
    emit("warn", msg, extra);
  },
  error(msg: string, extra?: Record<string, unknown>): void {
    emit("error", msg, extra);
  },
};
