type Level = "info" | "error";

function emit(level: Level, msg: string, extra?: Record<string, unknown>): void {
  const line = JSON.stringify({ level, msg, timestamp: new Date().toISOString(), ...extra }) + "\n";
  if (level === "error") {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
}

export const log = {
  info(msg: string, extra?: Record<string, unknown>): void {
    emit("info", msg, extra);
  },
  error(msg: string, extra?: Record<string, unknown>): void {
    emit("error", msg, extra);
  },
};
