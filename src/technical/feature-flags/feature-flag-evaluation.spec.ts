import { bucketOf, contextOf, evaluateFlag } from './feature-flag-evaluation';
import type { FeatureFlagSettings } from './feature-flag-evaluation';

function flag(overrides: Partial<FeatureFlagSettings> = {}) {
  return {
    enabled: true,
    rolloutPercentage: 100,
    rolloutBy: 'user',
    rules: [],
    ...overrides,
  } satisfies FeatureFlagSettings;
}

describe('evaluateFlag', () => {
  it('is off when the flag does not exist', () => {
    expect(evaluateFlag(null, 'beta', { userId: 'u1' })).toEqual({
      enabled: false,
      reason: 'not-found',
    });
  });

  it('treats enabled false as a kill switch that rules and percentage cannot override', () => {
    const settings = flag({
      enabled: false,
      rules: [
        { attribute: 'plan', operator: 'in', values: ['pro'], serve: true },
      ],
    });

    expect(evaluateFlag(settings, 'beta', { plan: 'pro' })).toEqual({
      enabled: false,
      reason: 'disabled',
    });
  });

  it('serves everyone at 100 percent without needing a subject', () => {
    expect(evaluateFlag(flag(), 'beta', {})).toEqual({
      enabled: true,
      reason: 'everyone',
    });
  });

  it('serves no one at 0 percent', () => {
    const settings = flag({ rolloutPercentage: 0 });

    for (const userId of ['a', 'b', 'c', 'd', 'e']) {
      expect(evaluateFlag(settings, 'beta', { userId }).enabled).toBe(false);
    }
  });

  it('answers the same for the same subject every time', () => {
    const settings = flag({ rolloutPercentage: 40 });
    const first = evaluateFlag(settings, 'beta', { userId: 'user-42' });

    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(evaluateFlag(settings, 'beta', { userId: 'user-42' })).toEqual(
        first,
      );
    }
  });

  it('only ever adds subjects when the percentage is raised', () => {
    const subjects = Array.from({ length: 300 }, (_, index) => `user-${index}`);
    let previous = new Set<string>();

    for (const percentage of [0, 10, 25, 50, 75, 100]) {
      const settings = flag({ rolloutPercentage: percentage });
      const current = new Set(
        subjects.filter(
          (userId) => evaluateFlag(settings, 'beta', { userId }).enabled,
        ),
      );

      for (const userId of previous) {
        expect(current.has(userId)).toBe(true);
      }

      previous = current;
    }

    expect(previous.size).toBe(subjects.length);
  });

  it('lands close to the requested share across many subjects', () => {
    const settings = flag({ rolloutPercentage: 30 });
    const enabled = Array.from({ length: 2000 }, (_, index) => `user-${index}`)
      .map((userId) => evaluateFlag(settings, 'beta', { userId }).enabled)
      .filter(Boolean).length;

    expect(enabled / 2000).toBeGreaterThan(0.25);
    expect(enabled / 2000).toBeLessThan(0.35);
  });

  it('buckets independently per flag key', () => {
    const subjects = Array.from({ length: 200 }, (_, index) => `user-${index}`);
    const differing = subjects.filter(
      (subject) => bucketOf('alpha', subject) !== bucketOf('beta', subject),
    );

    expect(differing.length).toBeGreaterThan(150);
  });

  it('buckets by tenant when rolloutBy is tenant, so every user of a tenant agrees', () => {
    const settings = flag({ rolloutPercentage: 50, rolloutBy: 'tenant' });
    const answers = new Set(
      ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'].map(
        (userId) =>
          evaluateFlag(settings, 'beta', { userId, tenantId: 't-1' }).enabled,
      ),
    );

    expect(answers.size).toBe(1);
  });

  it('falls back to the tenant for a user rollout when no user is known', () => {
    const settings = flag({ rolloutPercentage: 50 });

    expect(evaluateFlag(settings, 'beta', { tenantId: 't-1' })).toEqual(
      evaluateFlag(
        flag({ rolloutPercentage: 50, rolloutBy: 'tenant' }),
        'beta',
        {
          tenantId: 't-1',
        },
      ),
    );
  });

  it('is off, with a reason, when a partial rollout has nobody to bucket', () => {
    expect(evaluateFlag(flag({ rolloutPercentage: 50 }), 'beta', {})).toEqual({
      enabled: false,
      reason: 'no-subject',
    });
  });

  describe('targeting rules', () => {
    it('lets the first matching rule decide, ahead of the percentage', () => {
      const settings = flag({
        rolloutPercentage: 0,
        rules: [
          { attribute: 'tenant', operator: 'in', values: ['t-1'], serve: true },
          {
            attribute: 'tenant',
            operator: 'in',
            values: ['t-1'],
            serve: false,
          },
        ],
      });

      expect(evaluateFlag(settings, 'beta', { tenantId: 't-1' })).toEqual({
        enabled: true,
        reason: 'rule',
        ruleIndex: 0,
      });
    });

    it('can switch a flag off for a listed user inside a full rollout', () => {
      const settings = flag({
        rules: [
          { attribute: 'user', operator: 'in', values: ['bad'], serve: false },
        ],
      });

      expect(evaluateFlag(settings, 'beta', { userId: 'bad' }).enabled).toBe(
        false,
      );
      expect(evaluateFlag(settings, 'beta', { userId: 'good' }).enabled).toBe(
        true,
      );
    });

    it('matches on plan and on custom attributes', () => {
      const settings = flag({
        rolloutPercentage: 0,
        rules: [
          { attribute: 'plan', operator: 'in', values: ['pro'], serve: true },
          { attribute: 'country', operator: 'in', values: ['FR'], serve: true },
          { attribute: 'seats', operator: 'in', values: ['10'], serve: true },
        ],
      });

      expect(evaluateFlag(settings, 'beta', { plan: 'pro' }).ruleIndex).toBe(0);
      expect(
        evaluateFlag(settings, 'beta', { attributes: { country: 'FR' } })
          .ruleIndex,
      ).toBe(1);
      expect(
        evaluateFlag(settings, 'beta', { attributes: { seats: 10 } }).ruleIndex,
      ).toBe(2);
      expect(evaluateFlag(settings, 'beta', { plan: 'free' }).enabled).toBe(
        false,
      );
    });

    it('supports notIn, and never matches a rule about an attribute that was not supplied', () => {
      const settings = flag({
        rolloutPercentage: 0,
        rules: [
          {
            attribute: 'plan',
            operator: 'notIn',
            values: ['free'],
            serve: true,
          },
        ],
      });

      expect(evaluateFlag(settings, 'beta', { plan: 'pro' }).enabled).toBe(
        true,
      );
      expect(evaluateFlag(settings, 'beta', { plan: 'free' }).enabled).toBe(
        false,
      );
      expect(evaluateFlag(settings, 'beta', {}).enabled).toBe(false);
    });
  });
});

describe('contextOf', () => {
  it('reads a bare string as a tenant id, for call sites older than targeting', () => {
    expect(contextOf('t-1')).toEqual({ tenantId: 't-1' });
    expect(contextOf(undefined)).toEqual({});
    expect(contextOf({ userId: 'u' })).toEqual({ userId: 'u' });
  });
});
