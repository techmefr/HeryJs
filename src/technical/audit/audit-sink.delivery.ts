import { Inject, Injectable } from '@nestjs/common';
import type { AuditLog, AuditSink } from '@prisma/client';
import { DriverResolver } from '#technical/drivers/driver-resolver';
import { SecretsService } from '#technical/secrets/secrets.service';
import { STORAGE_MODULE } from '#technical/storage/storage-driver';
import type { StorageDriver } from '#technical/storage/storage-driver';
import { auditLines } from './audit-format';
import { assertSinkUrl } from './audit-sink-url';
import type { SinkHostResolver } from './audit-sink-url';
import {
  AUDIT_SINK_KIND_HTTP,
  AUDIT_SINK_SECRET_CONTEXT,
  AUDIT_SINK_TIMEOUT_MS,
  DEFAULT_STORAGE_DRIVER,
} from './audit-sink.constants';

export const AUDIT_SINK_OPTIONS = Symbol('AUDIT_SINK_OPTIONS');

export interface AuditSinkOptions {
  allowPrivateHosts: boolean;
  resolve?: SinkHostResolver;
  fetch?: typeof fetch;
}

export interface AuditBatch {
  fromSequence: number;
  toSequence: number;
  entries: AuditLog[];
}

const NDJSON_CONTENT_TYPE = 'application/x-ndjson';

/**
 * The two transports an audit sink can use, behind one call. Both are
 * idempotent for the same batch -- the HTTP one carries an `Idempotency-Key`
 * naming the sink and the sequence range, the storage one overwrites the same
 * object key -- because the outbox delivers at least once: a handler that
 * succeeded but could not record it will be run again.
 */
@Injectable()
export class AuditSinkDelivery {
  constructor(
    private readonly secrets: SecretsService,
    private readonly drivers: DriverResolver,
    @Inject(AUDIT_SINK_OPTIONS) private readonly options: AuditSinkOptions,
  ) {}

  async send(sink: AuditSink, batch: AuditBatch): Promise<void> {
    if (sink.kind === AUDIT_SINK_KIND_HTTP) {
      await this.sendHttp(sink, batch);
      return;
    }

    await this.sendStorage(sink, batch);
  }

  storageKey(sink: AuditSink, batch: AuditBatch): string {
    const prefix = (sink.keyPrefix ?? 'audit').replace(/\/+$/, '');
    const pad = (sequence: number) => String(sequence).padStart(12, '0');

    return `${prefix}/${sink.tenantId}/${pad(batch.fromSequence)}-${pad(batch.toSequence)}.jsonl`;
  }

  private async sendHttp(sink: AuditSink, batch: AuditBatch): Promise<void> {
    if (!sink.url) {
      throw new Error('the sink has no URL');
    }

    await assertSinkUrl(sink.url, {
      allowPrivate: this.options.allowPrivateHosts,
      resolve: this.options.resolve,
    });

    const headers: Record<string, string> = {
      'Content-Type': NDJSON_CONTENT_TYPE,
      'Idempotency-Key': `audit-${sink.id}-${batch.fromSequence}-${batch.toSequence}`,
      'X-Audit-Tenant': sink.tenantId,
      'X-Audit-Sequence-From': String(batch.fromSequence),
      'X-Audit-Sequence-To': String(batch.toSequence),
    };

    if (sink.authToken) {
      headers.Authorization = `Bearer ${this.secrets.decrypt(sink.authToken, AUDIT_SINK_SECRET_CONTEXT)}`;
    }

    const response = await (this.options.fetch ?? fetch)(sink.url, {
      method: 'POST',
      headers,
      body: auditLines(batch.entries, 'jsonl'),
      redirect: 'error',
      signal: AbortSignal.timeout(AUDIT_SINK_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`the sink answered HTTP ${response.status}`);
    }
  }

  private async sendStorage(sink: AuditSink, batch: AuditBatch): Promise<void> {
    const driverName = sink.storageDriver ?? DEFAULT_STORAGE_DRIVER;
    const driver = this.drivers.find<StorageDriver>(STORAGE_MODULE, driverName);

    if (!driver) {
      throw new Error(`no storage driver named "${driverName}" is installed`);
    }

    await driver.put(
      this.storageKey(sink, batch),
      Buffer.from(auditLines(batch.entries, 'jsonl'), 'utf8'),
      NDJSON_CONTENT_TYPE,
    );
  }
}
