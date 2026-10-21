import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EncryptedFieldQueryException } from '../errors/encrypted-field-query.exception';
import { EncryptedNestedWriteException } from '../errors/encrypted-nested-write.exception';
import { SecretDecryptionException } from '../errors/secret-decryption.exception';
import {
  hasEncryptedColumns,
  modelEncryption,
  secretContext,
} from './encrypted-columns';
import type { Keyring } from './keyring';

const NESTED_WRITE_KEYS = [
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'connectOrCreate',
];
const LOGICAL_KEYS = ['AND', 'OR', 'NOT'];
const DATA_OPERATIONS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
]);

type Args = Record<string, unknown>;

const logger = new Logger('Secrets');

function isRecord(value: unknown): value is Args {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function entriesOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

function referencedColumns(
  node: unknown,
  columns: ReadonlySet<string>,
): string[] {
  return entriesOf(node)
    .filter(isRecord)
    .flatMap((entry) =>
      Object.entries(entry).flatMap(([key, value]) => {
        if (LOGICAL_KEYS.includes(key)) {
          return referencedColumns(value, columns);
        }

        return columns.has(key) ? [key] : [];
      }),
    );
}

function assertNotQueried(model: string, args: Args): void {
  const columns = modelEncryption(model)?.columns;

  if (!columns || columns.size === 0) {
    return;
  }

  const uses: [string, unknown][] = [
    ['filter on', args.where],
    ['filter on', args.cursor],
    ['filter on', args.having],
    ['sort by', args.orderBy],
  ];

  for (const [use, node] of uses) {
    const [column] = referencedColumns(node, columns);

    if (column) {
      throw new EncryptedFieldQueryException(model, column, use);
    }
  }

  const grouped = entriesOf(args.by).find(
    (column): column is string =>
      typeof column === 'string' && columns.has(column),
  );

  if (grouped) {
    throw new EncryptedFieldQueryException(model, grouped, 'group by');
  }
}

function assertNoNestedWrite(model: string, data: unknown): void {
  const relations = modelEncryption(model)?.relations;

  if (!relations) {
    return;
  }

  for (const entry of entriesOf(data).filter(isRecord)) {
    for (const [key, value] of Object.entries(entry)) {
      const target = relations.get(key);

      if (!target || !isRecord(value)) {
        continue;
      }

      const writesThrough = NESTED_WRITE_KEYS.some((nested) => nested in value);

      if ((modelEncryption(target)?.columns.size ?? 0) > 0 && writesThrough) {
        throw new EncryptedNestedWriteException(model, key, target);
      }
    }
  }
}

function sealValue(
  keyring: () => Keyring,
  context: string,
  value: unknown,
): unknown {
  if (typeof value === 'string') {
    return keyring().seal(value, context);
  }

  if (isRecord(value) && typeof value.set === 'string') {
    return { ...value, set: keyring().seal(value.set, context) };
  }

  return value;
}

function sealData(
  keyring: () => Keyring,
  model: string,
  data: unknown,
): unknown {
  const columns = modelEncryption(model)?.columns;

  if (!columns || columns.size === 0 || data === undefined) {
    return data;
  }

  const sealEntry = (entry: unknown): unknown => {
    if (!isRecord(entry)) {
      return entry;
    }

    const sealed: Args = { ...entry };

    for (const column of columns) {
      if (column in sealed) {
        sealed[column] = sealValue(
          keyring,
          secretContext(model, column),
          sealed[column],
        );
      }
    }

    return sealed;
  };

  return Array.isArray(data) ? data.map(sealEntry) : sealEntry(data);
}

function sealArgs(
  keyring: () => Keyring,
  model: string,
  operation: string,
  args: Args,
): Args {
  assertNotQueried(model, args);
  assertNoNestedWrite(model, args.data);
  assertNoNestedWrite(model, args.create);
  assertNoNestedWrite(model, args.update);

  if (operation === 'upsert') {
    return {
      ...args,
      create: sealData(keyring, model, args.create),
      update: sealData(keyring, model, args.update),
    };
  }

  if (DATA_OPERATIONS.has(operation)) {
    return { ...args, data: sealData(keyring, model, args.data) };
  }

  return args;
}

function openColumn(
  keyring: () => Keyring,
  model: string,
  column: string,
  value: string,
): string {
  const context = secretContext(model, column);

  try {
    return keyring().open(value, context);
  } catch (error) {
    if (error instanceof SecretDecryptionException) {
      logger.error(
        `could not decrypt ${context} with key ${error.keyId ?? 'unknown'}`,
      );
    }

    throw error;
  }
}

function openNode(keyring: () => Keyring, model: string, node: unknown): void {
  if (Array.isArray(node)) {
    node.forEach((entry) => openNode(keyring, model, entry));
    return;
  }

  const encryption = modelEncryption(model);

  if (!encryption || !isRecord(node)) {
    return;
  }

  for (const column of encryption.columns) {
    const value = node[column];

    if (typeof value === 'string') {
      node[column] = openColumn(keyring, model, column, value);
    }
  }

  for (const [relation, target] of encryption.relations) {
    if (relation in node) {
      openNode(keyring, target, node[relation]);
    }
  }
}

export function encryptedFieldsExtension(keyring: () => Keyring) {
  return Prisma.defineExtension({
    name: 'encrypted-fields',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!hasEncryptedColumns()) {
            return query(args);
          }

          const result: unknown = await query(
            sealArgs(keyring, model, operation, args),
          );
          openNode(keyring, model, result);

          return result;
        },
      },
    },
  });
}
