import { Injectable, OnModuleInit } from '@nestjs/common';
import { CacheService } from '#technical/cache/cache.service';
import { OUTBOX_MODEL_NAME_PREFIX } from '#technical/outbox/outbox.constants';
import { OutboxRegistry } from '#technical/outbox/outbox.registry';
import type {
  OutboxDelivery,
  OutboxHandler,
} from '#technical/outbox/outbox.types';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { modelInvalidationPattern } from './output-cache-key';

const MODEL_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

/**
 * Every write to a tenant-scoped model already leaves a `model.*` message in
 * the outbox, in the same transaction as the write. Reading that rather than
 * hooking the write keeps a rolled-back write from dropping anything, and
 * catches writes that never went through an HTTP route at all.
 */
@Injectable()
export class OutputCacheInvalidator implements OutboxHandler, OnModuleInit {
  readonly name = 'output-cache';
  readonly names = [`${OUTBOX_MODEL_NAME_PREFIX}*`];

  constructor(
    private readonly outbox: OutboxRegistry,
    private readonly cache: CacheService,
  ) {}

  onModuleInit(): void {
    this.outbox.register(this);
  }

  async handle(delivery: OutboxDelivery): Promise<void> {
    const model = delivery.payload.model;
    const tenantId = delivery.tenantId;

    if (
      tenantId === null ||
      typeof model !== 'string' ||
      !MODEL_NAME_PATTERN.test(model)
    ) {
      return;
    }

    await TenantContextStorage.run({ tenantId }, () =>
      this.cache.invalidate(modelInvalidationPattern(model)),
    );
  }
}
