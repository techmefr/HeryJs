import type { PrismaClient } from '@prisma/client';
import {
  encryptedModels,
  modelEncryption,
  secretContext,
} from './encrypted-columns';
import type { Keyring } from './keyring';

const DEFAULT_BATCH_SIZE = 200;

export interface RotationOptions {
  batchSize?: number;
  adoptPlaintext?: boolean;
  dryRun?: boolean;
  tenantId?: string;
}

type ResolvedRotationOptions = Required<Omit<RotationOptions, 'tenantId'>> &
  Pick<RotationOptions, 'tenantId'>;

export interface ColumnRotationReport {
  model: string;
  column: string;
  rotated: number;
  alreadyCurrent: number;
  adopted: number;
  plaintextSkipped: number;
}

interface RotationDelegate {
  findMany(args: {
    where: { id: { gt: string }; tenantId?: string };
    orderBy: { id: 'asc' };
    take: number;
    select: Record<string, true>;
  }): Promise<Record<string, unknown>[]>;
  update(args: {
    where: { id: string };
    data: Record<string, string>;
  }): Promise<unknown>;
}

function delegateOf(client: PrismaClient, model: string): RotationDelegate {
  const name = model.charAt(0).toLowerCase() + model.slice(1);

  return (client as unknown as Record<string, RotationDelegate>)[
    name
  ] as RotationDelegate;
}

async function rotateColumn(
  client: PrismaClient,
  keyring: Keyring,
  model: string,
  column: string,
  options: ResolvedRotationOptions,
): Promise<ColumnRotationReport> {
  const delegate = delegateOf(client, model);
  const context = secretContext(model, column);
  const report: ColumnRotationReport = {
    model,
    column,
    rotated: 0,
    alreadyCurrent: 0,
    adopted: 0,
    plaintextSkipped: 0,
  };
  let cursor = '';

  for (;;) {
    const rows = await delegate.findMany({
      where: {
        id: { gt: cursor },
        ...(options.tenantId === undefined
          ? {}
          : { tenantId: options.tenantId }),
      },
      orderBy: { id: 'asc' },
      take: options.batchSize,
      select: { id: true, [column]: true },
    });

    if (rows.length === 0) {
      return report;
    }

    for (const row of rows) {
      const id = String(row.id);
      const value = row[column];
      cursor = id;

      if (typeof value !== 'string') {
        continue;
      }

      if (!keyring.isEnvelope(value)) {
        if (!options.adoptPlaintext) {
          report.plaintextSkipped += 1;
          continue;
        }

        report.adopted += 1;
        if (!options.dryRun) {
          await delegate.update({
            where: { id },
            data: { [column]: keyring.seal(value, context) },
          });
        }
        continue;
      }

      if (keyring.isCurrent(value)) {
        report.alreadyCurrent += 1;
        continue;
      }

      report.rotated += 1;
      if (!options.dryRun) {
        await delegate.update({
          where: { id },
          data: { [column]: keyring.reseal(value, context) },
        });
      }
    }
  }
}

export async function rotateSecrets(
  client: PrismaClient,
  keyring: Keyring,
  options: RotationOptions = {},
): Promise<ColumnRotationReport[]> {
  const resolved: ResolvedRotationOptions = {
    tenantId: options.tenantId,
    batchSize: options.batchSize ?? DEFAULT_BATCH_SIZE,
    adoptPlaintext: options.adoptPlaintext ?? false,
    dryRun: options.dryRun ?? false,
  };
  const reports: ColumnRotationReport[] = [];

  for (const model of encryptedModels()) {
    for (const column of modelEncryption(model)?.columns ?? []) {
      reports.push(
        await rotateColumn(client, keyring, model, column, resolved),
      );
    }
  }

  return reports;
}
