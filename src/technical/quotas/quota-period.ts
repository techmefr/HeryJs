import type { HeryConfigQuotaPeriod } from '#technical/config/hery-config.types';

export const TOTAL_PERIOD = 'total';

/**
 * The row a count lands in. UTC on purpose: a tenant's own timezone would make
 * "this month" mean a different instant for every tenant and move a boundary
 * when a tenant changes it, while a count that rolls over at one instant for
 * everyone can be reasoned about and billed against.
 */
export function periodKey(
  period: HeryConfigQuotaPeriod,
  now: Date = new Date(),
): string {
  if (period === 'total') {
    return TOTAL_PERIOD;
  }

  const day = now.toISOString().slice(0, 10);

  return period === 'day' ? day : day.slice(0, 7);
}
