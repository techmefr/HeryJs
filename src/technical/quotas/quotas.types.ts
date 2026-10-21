import type { HeryConfigQuotaPeriod } from '#technical/config/hery-config.types';

export interface QuotaStatus {
  name: string;
  period: HeryConfigQuotaPeriod;
  periodKey: string;
  limit: number;
  used: number;
  remaining: number;
  overridden: boolean;
}

export interface QuotaCheck {
  allowed: boolean;
  limit: number;
  used: number;
  remaining: number;
}

/**
 * Overrides under this prefix are not declared in `quotas`: they retune a
 * rate-limit bucket for one tenant, with the bucket's own window.
 */
export const RATE_LIMIT_OVERRIDE_PREFIX = 'rate-limit:';
