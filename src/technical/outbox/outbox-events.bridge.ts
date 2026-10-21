import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventDispatcher } from '#technical/events/event-dispatcher.service';
import { ModelChanged } from './model-changed.event';
import {
  OUTBOX_EVENT_NAME_PREFIX,
  OUTBOX_MODEL_NAME_PREFIX,
} from './outbox.constants';
import { OutboxRegistry } from './outbox.registry';
import type {
  ModelChangeKind,
  OutboxDelivery,
  OutboxHandler,
} from './outbox.types';

const BRIDGE_HANDLER_NAME = 'events-bus';
const MODEL_KINDS: readonly ModelChangeKind[] = [
  'created',
  'updated',
  'deleted',
];

function isModelChangeKind(value: unknown): value is ModelChangeKind {
  return MODEL_KINDS.some((kind) => kind === value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

@Injectable()
export class OutboxEventsBridge implements OutboxHandler, OnModuleInit {
  readonly name = BRIDGE_HANDLER_NAME;
  readonly names = [
    `${OUTBOX_MODEL_NAME_PREFIX}*`,
    `${OUTBOX_EVENT_NAME_PREFIX}*`,
  ];

  constructor(
    private readonly registry: OutboxRegistry,
    private readonly events: EventDispatcher,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(delivery: OutboxDelivery): Promise<void> {
    if (delivery.name.startsWith(OUTBOX_EVENT_NAME_PREFIX)) {
      await this.events.dispatchByName(
        delivery.name.slice(OUTBOX_EVENT_NAME_PREFIX.length),
        delivery.payload,
      );
      return;
    }

    const { payload } = delivery;
    const kind = payload.kind;

    if (!isModelChangeKind(kind) || typeof payload.model !== 'string') {
      return;
    }

    await this.events.dispatch(
      new ModelChanged(
        payload.model,
        kind,
        stringOrNull(payload.recordId),
        stringOrNull(payload.tenantId) ?? '',
        Array.isArray(payload.changedFields)
          ? payload.changedFields.filter(
              (field): field is string => typeof field === 'string',
            )
          : [],
        stringOrNull(payload.userId),
        stringOrNull(payload.impersonatedBy),
      ),
    );
  }
}
