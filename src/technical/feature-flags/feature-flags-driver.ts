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
import type {
  FeatureFlagContext,
  FeatureFlagEvaluation,
  FeatureFlagRule,
  RolloutBy,
} from './feature-flag-evaluation';

export const FEATURE_FLAGS_MODULE = 'feature-flags';

export function featureFlagDriverToken(driverName: string): symbol {
  return driverToken(FEATURE_FLAGS_MODULE, driverName);
}

export interface FeatureFlagRecord {
  id: string;
  key: string;
  tenantId: string | null;
  enabled: boolean;
  rolloutPercentage: number;
  rolloutBy: RolloutBy;
  rules: FeatureFlagRule[];
}

export type FeatureFlagPatch = Partial<
  Pick<
    FeatureFlagRecord,
    'enabled' | 'rolloutPercentage' | 'rolloutBy' | 'rules'
  >
>;

export interface FeatureFlagDriver {
  isEnabled(key: string, context?: FeatureFlagContext): Promise<boolean>;
  /**
   * Same decision as `isEnabled`, with the reason, so an operator can preview
   * what a given user or tenant would get. A provider that cannot explain
   * itself answers with reason `provider`.
   */
  evaluate(
    key: string,
    context?: FeatureFlagContext,
  ): Promise<FeatureFlagEvaluation>;
  list(tenantId?: string): Promise<FeatureFlagRecord[]>;
  listAll(
    page: PageQuery,
  ): Promise<{ records: FeatureFlagRecord[]; total: number }>;
  set(
    key: string,
    patch: FeatureFlagPatch,
    tenantId?: string,
  ): Promise<FeatureFlagRecord>;
  remove(key: string, tenantId?: string): Promise<boolean>;
}
