import { resolveDevDashboardSettings } from './dev-dashboard.settings';

describe('resolveDevDashboardSettings', () => {
  it('records in development', () => {
    expect(
      resolveDevDashboardSettings(undefined, 'development').isEnabled,
    ).toBe(true);
  });

  it.each(['production', 'test'])('stays off in %s by default', (env) => {
    expect(resolveDevDashboardSettings(undefined, env).isEnabled).toBe(false);
  });

  it('lets the config opt in to production explicitly', () => {
    expect(
      resolveDevDashboardSettings({ enabled: true }, 'production').isEnabled,
    ).toBe(true);
  });

  it('lets the config silence it in development', () => {
    expect(
      resolveDevDashboardSettings({ enabled: false }, 'development').isEnabled,
    ).toBe(false);
  });

  it('takes the thresholds from the config and defaults the rest', () => {
    expect(
      resolveDevDashboardSettings({ slowQueryMs: 10 }, 'development'),
    ).toMatchObject({ slowQueryMs: 10, nPlusOneThreshold: 5 });
  });
});
