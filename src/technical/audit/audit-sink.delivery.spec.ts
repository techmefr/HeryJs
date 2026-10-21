import type { AuditLog, AuditSink } from '@prisma/client';
import type { DriverResolver } from '#technical/drivers/driver-resolver';
import { SecretsService } from '#technical/secrets/secrets.service';
import type { StorageDriver } from '#technical/storage/storage-driver';
import { AUDIT_SINK_SECRET_CONTEXT } from './audit-sink.constants';
import { AuditSinkDelivery } from './audit-sink.delivery';
import type { AuditBatch } from './audit-sink.delivery';

const secrets = new SecretsService();

function sink(overrides: Partial<AuditSink> = {}): AuditSink {
  return {
    id: 'sink-1',
    tenantId: 'tenant-1',
    name: 'siem',
    kind: 'http',
    url: 'https://siem.example.com/ingest',
    authToken: null,
    storageDriver: null,
    keyPrefix: null,
    active: true,
    cursor: 0,
    lastError: null,
    lastDeliveredAt: null,
    lastDeliveredSequence: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function entry(sequence: number): AuditLog {
  return {
    id: `a${sequence}`,
    sequence,
    tenantId: 'tenant-1',
    model: 'BlogPost',
    operation: 'create',
    recordId: `post-${sequence}`,
    data: { n: sequence },
    userId: null,
    impersonatedBy: null,
    hash: `h${sequence}`,
    previousHash: `h${sequence - 1}`,
    createdAt: new Date('2026-02-10T08:00:00.000Z'),
  };
}

const batch: AuditBatch = {
  fromSequence: 4,
  toSequence: 5,
  entries: [entry(4), entry(5)],
};

const publicHost = () => Promise.resolve(['93.184.216.34']);

describe('AuditSinkDelivery', () => {
  it('posts the range as JSON lines with the token, an idempotency key and the range', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const bodies: string[] = [];
    const delivery = new AuditSinkDelivery(secrets, {} as DriverResolver, {
      allowPrivateHosts: false,
      resolve: publicHost,
      fetch: (url, init) => {
        calls.push({ url: url as string, init: init ?? {} });
        bodies.push(init?.body as string);
        return Promise.resolve(new Response(null, { status: 204 }));
      },
    });

    await delivery.send(
      sink({
        authToken: secrets.encrypt('s3cret', AUDIT_SINK_SECRET_CONTEXT),
      }),
      batch,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://siem.example.com/ingest');

    const headers = calls[0]?.init.headers as Record<string, string>;

    expect(headers.Authorization).toBe('Bearer s3cret');
    expect(headers['Idempotency-Key']).toBe('audit-sink-1-4-5');
    expect(headers['X-Audit-Sequence-From']).toBe('4');
    expect(headers['X-Audit-Sequence-To']).toBe('5');
    expect(calls[0]?.init.redirect).toBe('error');

    const lines = (bodies[0] ?? '').trimEnd().split('\n');

    expect(
      lines.map((line) => (JSON.parse(line) as { sequence: number }).sequence),
    ).toEqual([4, 5]);
  });

  it('sends no Authorization header when the sink has no token', async () => {
    let seen: Record<string, string> = {};
    const delivery = new AuditSinkDelivery(secrets, {} as DriverResolver, {
      allowPrivateHosts: false,
      resolve: publicHost,
      fetch: (_url, init) => {
        seen = init?.headers as Record<string, string>;
        return Promise.resolve(new Response(null, { status: 200 }));
      },
    });

    await delivery.send(sink(), batch);

    expect(seen.Authorization).toBeUndefined();
  });

  it('throws on a non-2xx answer so the outbox retries it', async () => {
    const delivery = new AuditSinkDelivery(secrets, {} as DriverResolver, {
      allowPrivateHosts: false,
      resolve: publicHost,
      fetch: () => Promise.resolve(new Response(null, { status: 503 })),
    });

    await expect(delivery.send(sink(), batch)).rejects.toThrow('HTTP 503');
  });

  it('checks the URL again at delivery, so a name that now points inside is refused', async () => {
    const fetchSpy = jest.fn();
    const delivery = new AuditSinkDelivery(secrets, {} as DriverResolver, {
      allowPrivateHosts: false,
      resolve: () => Promise.resolve(['10.0.0.9']),
      fetch: fetchSpy,
    });

    await expect(delivery.send(sink(), batch)).rejects.toMatchObject({
      key: 'audit.sink.refused',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('writes the range to one deterministic object key through the storage driver', async () => {
    const put = jest.fn<
      Promise<{ key: string; contentType: string }>,
      [string, Buffer, string]
    >(() => Promise.resolve({ key: 'k', contentType: 'x' }));
    const delivery = new AuditSinkDelivery(
      secrets,
      {
        find: () => ({ put }) as unknown as StorageDriver,
      } as unknown as DriverResolver,
      { allowPrivateHosts: false },
    );
    const storage = sink({
      kind: 'storage',
      url: null,
      storageDriver: 'local',
      keyPrefix: 'siem/audit/',
    });

    await delivery.send(storage, batch);
    await delivery.send(storage, batch);

    expect(put).toHaveBeenCalledTimes(2);
    expect(put.mock.calls[0]?.[0]).toBe(
      'siem/audit/tenant-1/000000000004-000000000005.jsonl',
    );
    expect(put.mock.calls[1]?.[0]).toBe(put.mock.calls[0]?.[0]);
    expect(put.mock.calls[0]?.[2]).toBe('application/x-ndjson');
    expect(
      put.mock.calls[0]?.[1].toString('utf8').trimEnd().split('\n'),
    ).toHaveLength(2);
  });

  it('fails clearly when the storage driver is not installed', async () => {
    const delivery = new AuditSinkDelivery(
      secrets,
      { find: () => undefined } as unknown as DriverResolver,
      { allowPrivateHosts: false },
    );

    await expect(
      delivery.send(
        sink({ kind: 'storage', url: null, storageDriver: 's3' }),
        batch,
      ),
    ).rejects.toThrow('no storage driver named "s3"');
  });
});
