import type { CapabilitySubject } from '#technical/capabilities/capabilities.types';
import { canReadQuotas, canSetQuotaOverride } from './quotas.policy';

const subject = (role: string) => ({ role }) as CapabilitySubject;

describe('quota policies', () => {
  it.each([canReadQuotas, canSetQuotaOverride])(
    'allow an admin and refuse anyone else',
    (policy) => {
      expect(policy(subject('admin')).allowed).toBe(true);
      expect(policy(subject('member')).allowed).toBe(false);
    },
  );
});
