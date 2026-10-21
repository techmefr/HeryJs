import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { CapabilityRecord } from '#technical/capabilities/capabilities.types';
import { OutboxRegistry } from '#technical/outbox/outbox.registry';
import type {
  ModelChangeKind,
  OutboxDelivery,
  OutboxHandler,
} from '#technical/outbox/outbox.types';
import {
  CHANGE_FEED_HANDLER_NAME,
  CHANGE_FEED_OUTBOX_PATTERN,
} from './change-feed.constants';
import { ChangeFeedRegistry } from './change-feed.registry';
import { CHANGE_FEED_BACKEND } from './change-feed.types';
import type { ChangeFeedBackend } from './change-feed.types';

const MODEL_KINDS: readonly ModelChangeKind[] = [
  'created',
  'updated',
  'deleted',
];

function isModelChangeKind(value: unknown): value is ModelChangeKind {
  return MODEL_KINDS.some((kind) => kind === value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function visibilityFromPayload(
  payload: Record<string, unknown>,
): CapabilityRecord | null {
  const ownerId = stringOrNull(payload.ownerId);

  if (ownerId === null) {
    return null;
  }

  return { ownerId, teamId: stringOrNull(payload.teamId) ?? undefined };
}

function visibleFieldsOf(
  changedFields: unknown,
  view: Record<string, unknown>,
): string[] {
  if (!Array.isArray(changedFields)) {
    return [];
  }

  return changedFields.filter(
    (field): field is string => typeof field === 'string' && field in view,
  );
}

@Injectable()
export class ChangeFeedPublisher implements OutboxHandler, OnModuleInit {
  readonly name = CHANGE_FEED_HANDLER_NAME;
  readonly names = [CHANGE_FEED_OUTBOX_PATTERN];

  constructor(
    private readonly outbox: OutboxRegistry,
    private readonly resources: ChangeFeedRegistry,
    @Inject(CHANGE_FEED_BACKEND) private readonly backend: ChangeFeedBackend,
  ) {}

  onModuleInit(): void {
    this.outbox.register(this);
  }

  async handle(delivery: OutboxDelivery): Promise<void> {
    const { payload } = delivery;
    const model = stringOrNull(payload.model);
    const tenantId = delivery.tenantId;

    if (
      model === null ||
      tenantId === null ||
      payload.tenantId !== tenantId ||
      !isModelChangeKind(payload.kind)
    ) {
      return;
    }

    const resource = this.resources.forModel(model);

    if (!resource) {
      return;
    }

    const recordId = stringOrNull(payload.recordId);
    const projection =
      payload.kind !== 'deleted' && recordId !== null
        ? await resource.project(recordId)
        : null;
    const visibility = projection?.visibility ?? visibilityFromPayload(payload);

    if (visibility === null) {
      return;
    }

    await this.backend.publish({
      type: 'change',
      id: delivery.id,
      tenantId,
      channel: resource.channel,
      model,
      kind: projection ? payload.kind : 'deleted',
      recordId,
      at: delivery.createdAt.toISOString(),
      changedFields: projection
        ? visibleFieldsOf(payload.changedFields, projection.view)
        : [],
      record: projection?.view ?? null,
      visibility,
    });
  }
}
