import type { Severity, Violation } from './types';

const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 20,
  major: 8,
  minor: 2,
};

export function scoreOf(freshViolations: readonly Violation[]): number {
  const penalty = freshViolations.reduce(
    (sum, violation) => sum + SEVERITY_WEIGHT[violation.severity],
    0,
  );

  return Math.max(0, 100 - penalty);
}
