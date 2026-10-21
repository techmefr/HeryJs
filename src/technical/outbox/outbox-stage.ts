import { TenantContextStorage } from '../tenancy/tenant-context';
import {
  OUTBOX_EXCLUDED_MODELS,
  OUTBOX_MODEL_NAME_PREFIX,
} from './outbox.constants';
import type {
  ModelChangeKind,
  ModelChangePayload,
  OutboxMessageInput,
  OutboxStageClient,
} from './outbox.types';

const OPERATION_KINDS = new Map<string, ModelChangeKind>([
  ['create', 'created'],
  ['createManyAndReturn', 'created'],
  ['update', 'updated'],
  ['updateManyAndReturn', 'updated'],
  ['upsert', 'updated'],
  ['delete', 'deleted'],
]);

export function outboxEmitsFor(model: string, operation: string): boolean {
  return !OUTBOX_EXCLUDED_MODELS.has(model) && OPERATION_KINDS.has(operation);
}

export async function stageOutboxMessages(
  tx: OutboxStageClient,
  messages: OutboxMessageInput[],
): Promise<void> {
  if (messages.length === 0) {
    return;
  }

  await tx.outboxMessage.createMany({
    data: messages.map((message) => ({
      tenantId: message.tenantId,
      name: message.name,
      payload: message.payload,
    })),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function changedFieldsOf(args: unknown): string[] {
  if (!isRecord(args)) {
    return [];
  }

  if (isRecord(args.data)) {
    return Object.keys(args.data);
  }

  return isRecord(args.update) ? Object.keys(args.update) : [];
}

function stampsDeletedAt(args: unknown): boolean {
  if (!isRecord(args) || !isRecord(args.data)) {
    return false;
  }

  const deletedAt = args.data.deletedAt;

  if (deletedAt === undefined || deletedAt === null) {
    return false;
  }

  if (deletedAt instanceof Date) {
    return true;
  }

  if (isRecord(deletedAt)) {
    return deletedAt.set !== undefined && deletedAt.set !== null;
  }

  return true;
}

function kindFor(operation: string, args: unknown): ModelChangeKind | null {
  const kind = OPERATION_KINDS.get(operation) ?? null;

  if (operation === 'update' && stampsDeletedAt(args)) {
    return 'deleted';
  }

  return kind;
}

function stringFieldOf(record: unknown, field: string): string | null {
  if (!isRecord(record)) {
    return null;
  }

  const value = record[field];

  return typeof value === 'string' ? value : null;
}

function recordIdOf(record: unknown): string | null {
  if (!isRecord(record)) {
    return null;
  }

  return typeof record.id === 'string' ? record.id : null;
}

export function modelChangeMessages(input: {
  model: string;
  operation: string;
  args: unknown;
  result: unknown;
  tenantId: string;
}): OutboxMessageInput[] {
  const kind = kindFor(input.operation, input.args);

  if (kind === null) {
    return [];
  }

  const records = Array.isArray(input.result) ? input.result : [input.result];
  const userId = TenantContextStorage.getUserId();
  const impersonatedBy = TenantContextStorage.getImpersonatedBy();
  const changedFields = kind === 'created' ? [] : changedFieldsOf(input.args);

  return records.map((record) => {
    const payload: ModelChangePayload = {
      model: input.model,
      kind,
      recordId: recordIdOf(record),
      tenantId: input.tenantId,
      changedFields,
      ownerId: stringFieldOf(record, 'ownerId'),
      teamId: stringFieldOf(record, 'teamId'),
      userId,
      impersonatedBy,
    };

    return {
      name: `${OUTBOX_MODEL_NAME_PREFIX}${kind}`,
      payload,
      tenantId: input.tenantId,
    };
  });
}
