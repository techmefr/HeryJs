const REPORT_INTERVAL_MS = 10_000;

const lastReportedAt = new Map<string, number>();

/**
 * Where a log sink says it is broken. It cannot say so through the logger,
 * which is the thing that is failing, so it writes to stderr directly -- and
 * at most once per interval per sink, because a collector that is down fails
 * on every batch and would otherwise bury everything else in its own errors.
 */
export function reportLogDriverFailure(driver: string, error: unknown): void {
  const now = Date.now();
  const last = lastReportedAt.get(driver);

  if (last !== undefined && now - last < REPORT_INTERVAL_MS) {
    return;
  }

  lastReportedAt.set(driver, now);

  const reason = error instanceof Error ? error.message : 'unknown error';

  process.stderr.write(`[logging] ${driver} driver failed: ${reason}\n`);
}
