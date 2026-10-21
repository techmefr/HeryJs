import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { authPrismaClient } from '#technical/auth/better-auth.instance';

const TENANT_COLUMN = 'tenantId';
const TEST_TENANT_PREFIX = 'test-';

class RollbackSignal extends Error {
  constructor() {
    super('Rolling back the test transaction');
    this.name = 'RollbackSignal';
  }
}

export class TenantPurgeStuckException extends Error {
  constructor(tables: string[], cause: unknown) {
    super(
      `Could not purge tenant rows from ${tables.join(', ')}; a foreign key still points at them`,
      { cause },
    );
    this.name = 'TenantPurgeStuckException';
  }
}

export function createTestTenantId(): string {
  return `${TEST_TENANT_PREFIX}${randomUUID()}`;
}

export async function inRolledBackTransaction<T>(
  client: PrismaClient,
  work: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  let outcome: { value: T } | null = null;

  try {
    await client.$transaction(async (transaction) => {
      outcome = { value: await work(transaction) };
      throw new RollbackSignal();
    });
  } catch (error) {
    if (!(error instanceof RollbackSignal)) {
      throw error;
    }
  }

  if (outcome === null) {
    throw new Error('The test transaction finished without running its work');
  }

  return (outcome as { value: T }).value;
}

function tenantTables(): string[] {
  return Prisma.dmmf.datamodel.models
    .filter((model) =>
      model.fields.some((field) => field.name === TENANT_COLUMN),
    )
    .map((model) => model.dbName ?? model.name);
}

export async function purgeTenant(tenantId: string): Promise<void> {
  let pending = tenantTables();

  while (pending.length > 0) {
    const stuck: string[] = [];
    let lastError: unknown = null;

    for (const table of pending) {
      try {
        await authPrismaClient.$executeRawUnsafe(
          `DELETE FROM "${table}" WHERE "${TENANT_COLUMN}" = $1`,
          tenantId,
        );
      } catch (error) {
        stuck.push(table);
        lastError = error;
      }
    }

    if (stuck.length === pending.length) {
      throw new TenantPurgeStuckException(stuck, lastError);
    }

    pending = stuck;
  }
}
