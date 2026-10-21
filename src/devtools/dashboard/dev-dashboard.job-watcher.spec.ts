import { TelemetryBus } from '#technical/tracing/telemetry-bus';
import type { TelemetryRecord } from '#technical/tracing/telemetry-bus';
import { DevDashboardJobWatcher } from './dev-dashboard.job-watcher';
import type { DevDashboardSettings } from './dev-dashboard.settings';

const SETTINGS: DevDashboardSettings = {
  isEnabled: true,
  retentionHours: 24,
  maxEntriesPerTenant: 100,
  slowQueryMs: 100,
  nPlusOneThreshold: 5,
};

describe('DevDashboardJobWatcher', () => {
  const heard: TelemetryRecord[] = [];
  let unsubscribe: () => void;
  const watcher = new DevDashboardJobWatcher(
    { get: jest.fn() } as never,
    SETTINGS,
  );

  beforeEach(() => {
    heard.length = 0;
    unsubscribe = TelemetryBus.subscribe((record) => heard.push(record));
  });

  afterEach(() => unsubscribe());

  it('reports a finished job with its duration and its tenant', async () => {
    await watcher.record(
      {
        getJob: () =>
          Promise.resolve({
            name: 'mail.send',
            data: { tenantId: 'acme', html: '<p>secret</p>' },
            processedOn: 1000,
            finishedOn: 1250,
          }),
      },
      'heryjs',
      '7',
      'completed',
      null,
    );

    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({
      kind: 'job',
      queue: 'heryjs',
      name: 'mail.send',
      status: 'completed',
      durationMs: 250,
      tenantId: 'acme',
    });
    expect(JSON.stringify(heard[0])).not.toContain('secret');
  });

  it('records a job with no tenant against none', async () => {
    await watcher.record(
      { getJob: () => Promise.resolve({ name: 'x', data: {} }) },
      'heryjs',
      '1',
      'failed',
      'boom',
    );

    expect(heard[0]).toMatchObject({
      tenantId: null,
      status: 'failed',
      error: 'boom',
      durationMs: null,
    });
  });

  it('says nothing about a job that is already gone', async () => {
    await watcher.record(
      { getJob: () => Promise.resolve(undefined) },
      'heryjs',
      '1',
      'completed',
      null,
    );

    expect(heard).toHaveLength(0);
  });

  it('survives a queue that cannot be read', async () => {
    await expect(
      watcher.record(
        { getJob: () => Promise.reject(new Error('redis down')) },
        'heryjs',
        '1',
        'completed',
        null,
      ),
    ).resolves.toBeUndefined();
  });
});
