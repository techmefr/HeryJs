import type { TelemetryRecord } from '#technical/tracing/telemetry-bus';
import { DevDashboardRecorder } from './dev-dashboard.recorder';
import type { DevDashboardSettings } from './dev-dashboard.settings';
import type { DevDashboardStore } from './dev-dashboard.store';
import type { NewDevDashboardEntry } from './dev-dashboard.types';

const SETTINGS: DevDashboardSettings = {
  isEnabled: true,
  retentionHours: 24,
  maxEntriesPerTenant: 100,
  slowQueryMs: 100,
  nPlusOneThreshold: 3,
};

function query(
  sql: string,
  durationMs: number,
  requestId: string | null,
): TelemetryRecord {
  return {
    kind: 'query',
    sql,
    durationMs,
    tenantId: 'acme',
    requestId,
    timestamp: new Date(),
  };
}

function request(requestId: string | null, tenantId = 'acme'): TelemetryRecord {
  return {
    kind: 'request',
    method: 'GET',
    path: '/tags',
    status: 200,
    durationMs: 30,
    tenantId,
    requestId,
    timestamp: new Date(),
  };
}

describe('DevDashboardRecorder', () => {
  const written: NewDevDashboardEntry[] = [];
  let insertMany: jest.Mock;
  let recorder: DevDashboardRecorder;

  beforeEach(() => {
    written.length = 0;
    insertMany = jest.fn((entries: NewDevDashboardEntry[]) => {
      written.push(...entries);
      return Promise.resolve();
    });
    recorder = new DevDashboardRecorder(SETTINGS, {
      insertMany,
    } as unknown as DevDashboardStore);
  });

  it('keeps a query only when it is slow', async () => {
    recorder.hear(query('SELECT 1', 5, null));
    recorder.hear(query('SELECT 2', 250, null));
    await recorder.flush();

    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ kind: 'slow-query', durationMs: 250 });
  });

  it('never stores statement values, only the fingerprint', async () => {
    recorder.hear(query('SELECT * FROM "Tag" WHERE "id" = $4', 250, null));
    await recorder.flush();

    expect(written[0]?.label).toBe('SELECT * FROM "Tag" WHERE "id" = ?');
  });

  it('flags the same statement run past the threshold inside one request', async () => {
    for (let index = 0; index < 4; index += 1) {
      recorder.hear(
        query(`SELECT * FROM "Tag" WHERE "id" = $${index + 1}`, 2, 'req-1'),
      );
    }

    recorder.hear(request('req-1'));
    await recorder.flush();

    const findings = written.filter((entry) => entry.kind === 'n-plus-one');

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      tenantId: 'acme',
      requestId: 'req-1',
      durationMs: 8,
      detail: { count: 4 },
    });
  });

  it('does not add up one statement across different requests', async () => {
    for (const requestId of ['req-1', 'req-2', 'req-3', 'req-4']) {
      recorder.hear(query('SELECT * FROM "Tag"', 2, requestId));
      recorder.hear(request(requestId));
    }

    await recorder.flush();

    expect(written.filter((entry) => entry.kind === 'n-plus-one')).toHaveLength(
      0,
    );
  });

  it('keeps the request itself', async () => {
    recorder.hear(request('req-1'));
    await recorder.flush();

    expect(written).toMatchObject([{ kind: 'request', label: 'GET /tags' }]);
  });

  it('ignores the statements of its own table', async () => {
    recorder.hear(query('INSERT INTO "DevtoolsEntry" VALUES ($1)', 900, null));
    await recorder.flush();

    expect(written).toHaveLength(0);
  });

  it('drops a batch it cannot persist without throwing', async () => {
    insertMany.mockRejectedValueOnce(new Error('connection lost'));
    recorder.hear(request('req-1'));

    await expect(recorder.flush()).resolves.toBeUndefined();

    recorder.hear(request('req-2'));
    await recorder.flush();

    expect(written).toHaveLength(1);
  });

  it('flushes nothing when nothing was heard', async () => {
    await recorder.flush();

    expect(insertMany).not.toHaveBeenCalled();
  });
});
