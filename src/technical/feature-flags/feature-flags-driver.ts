/**
 * Feature flags are a kernel capability, not an optional module like mail or
 * sms, so this contract has no matching `src/modules/feature-flags`. It still
 * lives here rather than beside the service, because an external provider
 * (LaunchDarkly, Unleash) ships as its own package binding
 * `featureFlagDriverToken('launchdarkly')` from outside this folder, and
 * `.dependency-cruiser.cjs` forbids that package from reaching a contract
 * owned by a module.
 */
import { driverToken } from '#technical/drivers/driver-token';
import type { PageQuery } from '#technical/http/page-query';

export const FEATURE_FLAGS_MODULE = 'feature-flags';

export function featureFlagDriverToken(driverName: string): symbol {
  return driverToken(FEATURE_FLAGS_MODULE, driverName);
}

export interface FeatureFlagRecord {
  id: string;
  key: string;
  tenantId: string | null;
  enabled: boolean;
}

export interface FeatureFlagDriver {
  isEnabled(key: string, tenantId?: string): Promise<boolean>;
  list(tenantId?: string): Promise<FeatureFlagRecord[]>;
  listAll(
    page: PageQuery,
  ): Promise<{ records: FeatureFlagRecord[]; total: number }>;
  set(
    key: string,
    enabled: boolean,
    tenantId?: string,
  ): Promise<FeatureFlagRecord>;
}
