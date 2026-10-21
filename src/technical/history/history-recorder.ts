import type { Prisma, PrismaClient } from '@prisma/client';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { HistoryOperationStorage } from './history-operation';
import { historyColumnsOf } from './history-columns';
import type { HistoryOperation } from './history.types';
import { snapshotOf } from './snapshot';

type SnapshotClient = Pick<PrismaClient, 'recordSnapshot'>;

const RECORDED_OPERATIONS = new Set(['create', 'update', 'upsert', 'delete']);

interface WriteDescription {
  model: string;
  operation: string;
  args: unknown;
  result: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Prisma reports a soft delete, a restore and an edit all as "update". The
 * columns that make the difference are the ones the write itself touched, so
 * the operation is read off the result (deletedAt is set) and the arguments
 * (deletedAt is being cleared) rather than asked of the caller.
 */
function operationOf(write: WriteDescription): HistoryOperation {
  if (write.operation === 'create') {
    return 'create';
  }

  const declared = HistoryOperationStorage.current();

  if (declared) {
    return declared;
  }

  const result = write.result as Record<string, unknown>;

  if (result.deletedAt != null) {
    return 'delete';
  }

  const data = isRecord(write.args) ? write.args.data : undefined;

  return isRecord(data) && data.deletedAt === null ? 'restore' : 'update';
}

/**
 * Stores the snapshot a write leaves behind, in the transaction the write
 * already runs in when there is one. A model with no registered columns is not
 * a history model and costs one map lookup. A bulk write (updateMany,
 * deleteMany, createMany) is not recorded: its result carries a count, not the
 * rows, so there is nothing to snapshot without reading them back.
 */
export async function recordHistoryOf(
  client: SnapshotClient | Prisma.TransactionClient,
  write: WriteDescription,
): Promise<void> {
  if (
    !RECORDED_OPERATIONS.has(write.operation) ||
    historyColumnsOf(write.model) === null ||
    !isRecord(write.result) ||
    typeof write.result.id !== 'string'
  ) {
    return;
  }

  const tenantId = TenantContextStorage.findTenantId();

  if (tenantId === null) {
    return;
  }

  if (write.operation === 'delete') {
    await client.recordSnapshot.deleteMany({
      where: { tenantId, model: write.model, recordId: write.result.id },
    });
    return;
  }

  const snapshot = snapshotOf(write.model, write.result);

  if (snapshot === null) {
    return;
  }

  await client.recordSnapshot.create({
    data: {
      tenantId,
      model: write.model,
      recordId: write.result.id,
      operation: operationOf(write),
      snapshot: snapshot as Prisma.InputJsonObject,
      userId: TenantContextStorage.getUserId(),
      impersonatedBy: TenantContextStorage.getImpersonatedBy(),
    },
  });
}
