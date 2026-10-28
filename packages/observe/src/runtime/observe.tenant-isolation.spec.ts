import { observeSettings } from './observe-options';

describe('tenant isolation', () => {
  afterEach(() => {
    delete process.env.OBSERVE_ENABLED;
  });

  it('configures the agent once for the process, carrying no per-tenant state', () => {
    process.env.OBSERVE_ENABLED = 'true';

    expect(observeSettings()).toEqual(observeSettings());
    expect(Object.keys(observeSettings().module).sort()).toEqual([
      'enabled',
      'forwardLogs',
      'serviceId',
    ]);
  });
});
