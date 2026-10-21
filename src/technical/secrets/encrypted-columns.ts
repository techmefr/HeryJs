import { Prisma } from '@prisma/client';

const ENCRYPTED_COLUMNS = new Set<string>(['BlogPost.privateNote']);
const COLUMN_SEPARATOR = '.';
export const REDACTED_VALUE = '[encrypted]';

export interface ModelEncryption {
  columns: ReadonlySet<string>;
  relations: ReadonlyMap<string, string>;
}

let registry: Map<string, ModelEncryption> | null = null;

function buildRegistry(): Map<string, ModelEncryption> {
  return new Map(
    Prisma.dmmf.datamodel.models.map((model) => [
      model.name,
      {
        columns: new Set(
          model.fields
            .filter(
              (field) =>
                field.kind === 'scalar' &&
                field.type === 'String' &&
                ENCRYPTED_COLUMNS.has(secretContext(model.name, field.name)),
            )
            .map((field) => field.name),
        ),
        relations: new Map(
          model.fields
            .filter((field) => field.kind === 'object')
            .map((field) => [field.name, field.type]),
        ),
      },
    ]),
  );
}

function models(): Map<string, ModelEncryption> {
  registry ??= buildRegistry();
  return registry;
}

export function modelEncryption(model: string): ModelEncryption | null {
  return models().get(model) ?? null;
}

export function encryptedColumnsOf(model: string): string[] {
  return [...(modelEncryption(model)?.columns ?? [])];
}

export function encryptedModels(): string[] {
  return [...models().entries()]
    .filter(([, encryption]) => encryption.columns.size > 0)
    .map(([name]) => name);
}

export function hasEncryptedColumns(): boolean {
  return encryptedModels().length > 0;
}

export function secretContext(model: string, column: string): string {
  return `${model}${COLUMN_SEPARATOR}${column}`;
}

export function declaredEncryptedColumns(): string[] {
  return [...ENCRYPTED_COLUMNS];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function redactEncryptedColumns(model: string, value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactEncryptedColumns(model, entry));
  }

  const encryption = modelEncryption(model);

  if (!encryption || !isRecord(value)) {
    return value;
  }

  const redacted: Record<string, unknown> = { ...value };

  for (const column of encryption.columns) {
    if (typeof redacted[column] === 'string') {
      redacted[column] = REDACTED_VALUE;
    }
  }

  for (const [relation, target] of encryption.relations) {
    if (relation in redacted) {
      redacted[relation] = redactEncryptedColumns(target, redacted[relation]);
    }
  }

  return redacted;
}
