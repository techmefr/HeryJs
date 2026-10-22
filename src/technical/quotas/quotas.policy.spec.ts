import type { CapabilitySubject } from '#technical/capabilities/capabilities.types';
import { grantPlatformOperator } from '#devtools/testing/platform-operator';
import {
  canReadQuotas,
  canReadTenantQuotas,
  canResetQuota,
  canSetQuotaOverride,
} from './quotas.policy';

const subject = (role: string, id = 'someone') =>
  ({ id, role }) as CapabilitySubject;

describe('quota policies', () => {
  it.each([canReadQuotas])(
    'allow an admin and refuse anyone else',
    (policy) => {
      expect(policy(subject('admin')).allowed).toBe(true);
      expect(policy(subject('member')).allowed).toBe(false);
    },
  );

  it.each([canReadTenantQuotas, canResetQuota, canSetQuotaOverride])(
    'reach across tenants, so only the platform operator passes',
    (policy) => {
      grantPlatformOperator('operator-id');

      expect(policy(subject('admin')).allowed).toBe(false);
      expect(policy(subject('member', 'operator-id')).allowed).toBe(true);
    },
  );
});
