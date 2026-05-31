import { Database } from "bun:sqlite";
import { log } from "./logger";

export interface PurgeResult {
  auditDeleted: number;
  deliveriesDeleted: number;
}

export function purgeExpiredRecords(db: Database, retentionDays: number): PurgeResult {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  const auditResult = db.run(
    "DELETE FROM _audit WHERE timestamp < ?",
    [cutoff]
  );

  const deliveriesResult = db.run(
    "DELETE FROM _webhook_deliveries WHERE created_at < ? AND status IN ('success', 'failed')",
    [cutoff]
  );

  return {
    auditDeleted: auditResult.changes,
    deliveriesDeleted: deliveriesResult.changes,
  };
}

export function startRetentionJob(db: Database, retentionDays: number, intervalMs: number): ReturnType<typeof setInterval> {
  return setInterval(() => {
    try {
      const { auditDeleted, deliveriesDeleted } = purgeExpiredRecords(db, retentionDays);
      if (auditDeleted > 0 || deliveriesDeleted > 0) {
        log.info("retention.purge", { audit_deleted: auditDeleted, deliveries_deleted: deliveriesDeleted, retention_days: retentionDays });
      }
    } catch (err) {
      log.error("retention.purge.error", { error: String(err) });
    }
  }, intervalMs);
}
