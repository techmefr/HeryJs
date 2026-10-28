import { observeSettings } from './observe-options';

const VARIABLES = [
  'OBSERVE_ENABLED',
  'OBSERVE_SERVICE_ID',
  'OBSERVE_ENDPOINT',
  'OBSERVE_FORWARD_LOGS',
  'OBSERVE_SOURCE_CONTEXT',
];

describe('observeSettings', () => {
  afterEach(() => {
    for (const name of VARIABLES) {
      delete process.env[name];
    }
  });

  it('sends nothing by default: disabled, no logs, no source, no custom endpoint', () => {
    expect(observeSettings()).toEqual({
      create: { sourceContext: false },
      module: { enabled: false, serviceId: 'heryjs', forwardLogs: false },
    });
  });

  it('turns each capability on only when asked', () => {
    process.env.OBSERVE_ENABLED = 'true';
    process.env.OBSERVE_SERVICE_ID = 'billing-api';
    process.env.OBSERVE_FORWARD_LOGS = 'true';
    process.env.OBSERVE_SOURCE_CONTEXT = 'true';
    process.env.OBSERVE_ENDPOINT = 'https://collector.example.com';

    expect(observeSettings()).toEqual({
      create: { sourceContext: true },
      module: {
        enabled: true,
        serviceId: 'billing-api',
        forwardLogs: true,
        endpoint: 'https://collector.example.com',
      },
    });
  });

  it('refuses a flag that is neither true nor false rather than guessing', () => {
    process.env.OBSERVE_ENABLED = 'yes';

    expect(() => observeSettings()).toThrow();
  });

  it('refuses a collector endpoint that is not https', () => {
    process.env.OBSERVE_ENDPOINT = 'http://collector.example.com';

    expect(() => observeSettings()).toThrow();
  });
});
