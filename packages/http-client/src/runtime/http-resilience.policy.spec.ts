import type { CapabilitySubject } from '#kernel/capabilities/capabilities.types';
import { env } from '#kernel/config/env';
import {
  canManageHttpCircuits,
  canReadHttpCircuits,
} from './http-resilience.policy';

const mutableEnv = env as unknown as Record<string, string | undefined>;

const subject = (id: string, role: string | null): CapabilitySubject => ({
  id,
  role,
  teamIds: [],
  currentTeamId: null,
});

describe('http circuit policies', () => {
  const saved = mutableEnv.PLATFORM_OPERATOR_IDS;

  afterEach(() => {
    mutableEnv.PLATFORM_OPERATOR_IDS = saved;
  });

  it.each([canReadHttpCircuits, canManageHttpCircuits])(
    'refuse a tenant admin, since a circuit is shared by every tenant',
    (policy) => {
      mutableEnv.PLATFORM_OPERATOR_IDS = 'operator-1';

      expect(policy(subject('admin-1', 'admin')).allowed).toBe(false);
      expect(policy(subject('member-1', null)).allowed).toBe(false);
    },
  );

  it.each([canReadHttpCircuits, canManageHttpCircuits])(
    'allow a platform operator, and nobody when none is configured',
    (policy) => {
      mutableEnv.PLATFORM_OPERATOR_IDS = ' operator-1 , operator-2';

      expect(policy(subject('operator-2', null)).allowed).toBe(true);

      mutableEnv.PLATFORM_OPERATOR_IDS = undefined;

      expect(policy(subject('operator-2', 'admin')).allowed).toBe(false);
    },
  );
});
