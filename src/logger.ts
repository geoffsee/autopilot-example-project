type Level = "info" | "warn" | "error";

function emit(level: Level, msg: string, extra?: Record<string, unknown>): void {
  const line = JSON.stringify({ ...extra, level, msg, timestamp: new Date().toISOString() }) + "\n";
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
