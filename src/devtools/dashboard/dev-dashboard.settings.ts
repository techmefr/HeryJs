import { heryConfig } from '#technical/config/hery-config';
import type { HeryConfigDevDashboard } from '#technical/config/hery-config.types';

export interface DevDashboardSettings {
  isEnabled: boolean;
  retentionHours: number;
  maxEntriesPerTenant: number;
  slowQueryMs: number;
  nPlusOneThreshold: number;
}

export const DEV_DASHBOARD_SETTINGS = Symbol('DEV_DASHBOARD_SETTINGS');

const DEFAULT_RETENTION_HOURS = 24;
const DEFAULT_MAX_ENTRIES_PER_TENANT = 5000;
const DEFAULT_SLOW_QUERY_MS = 100;
const DEFAULT_N_PLUS_ONE_THRESHOLD = 5;

const SILENT_ENVIRONMENTS = new Set(['production', 'test']);

/**
 * Off wherever the data would be real (production) and wherever it would only
 * be noise (the test run, where every http spec would write rows nobody reads).
 * An explicit `enabled` in hery.config.ts wins in both directions, which is the
 * opt-in a deployed environment needs and the switch a developer needs to
 * silence it locally.
 */
export function resolveDevDashboardSettings(
  config: HeryConfigDevDashboard | undefined,
  nodeEnv: string | undefined,
): DevDashboardSettings {
  return {
    isEnabled: config?.enabled ?? !SILENT_ENVIRONMENTS.has(nodeEnv ?? ''),
    retentionHours: config?.retentionHours ?? DEFAULT_RETENTION_HOURS,
    maxEntriesPerTenant:
      config?.maxEntriesPerTenant ?? DEFAULT_MAX_ENTRIES_PER_TENANT,
    slowQueryMs: config?.slowQueryMs ?? DEFAULT_SLOW_QUERY_MS,
    nPlusOneThreshold:
      config?.nPlusOneThreshold ?? DEFAULT_N_PLUS_ONE_THRESHOLD,
  };
}

export function devDashboardSettingsFromConfig(): DevDashboardSettings {
  return resolveDevDashboardSettings(
    heryConfig.devDashboard,
    process.env.NODE_ENV,
  );
}
