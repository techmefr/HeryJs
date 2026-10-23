import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';

const MODEL_BLOCK = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
const TENANT_FIELD = /^\s*tenantId\s+String(\?)?/m;
const ENABLED_TABLE =
  /ALTER\s+TABLE\s+"(\w+)"\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;
export interface TenantModel {
  name: string;
  optional: boolean;
}

/**
 * Every model carrying a tenantId column, which is the only thing a row-level
 * policy can be written against. Read from the schema rather than from a list
 * kept by hand, so a model that gains the column cannot stay unnoticed.
 */
export function tenantModelsIn(schemaSource: string): TenantModel[] {
  const models: TenantModel[] = [];

  for (const match of schemaSource.matchAll(MODEL_BLOCK)) {
    const field = TENANT_FIELD.exec(match[2] ?? '');

    if (field) {
      models.push({ name: match[1]!, optional: field[1] === '?' });
    }
  }

  return models;
}

/**
 * Every model the schema declares, tenant column or not. The tenancy check
 * needs the whole list: a model with no tenantId is the case it exists to
 * catch, and that one is invisible to tenantModelsIn.
 */
export function declaredModelsIn(schemaSource: string): string[] {
  return [...schemaSource.matchAll(/^model\s+(\w+)/gm)].map(
    (match) => match[1]!,
  );
}

export function rlsEnabledTablesIn(migrationsDir: string): Set<string> {
  if (!existsSync(migrationsDir)) {
    return new Set();
  }

  const tables = new Set<string>();

  for (const entry of readdirSync(migrationsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const file = path.join(migrationsDir, entry.name, 'migration.sql');

    if (!existsSync(file)) {
      continue;
    }

    for (const match of readFileSync(file, 'utf8').matchAll(ENABLED_TABLE)) {
      tables.add(match[1]!);
    }
  }

  return renamedThrough(migrationsDir, tables);
}

// A policy survives ALTER TABLE ... RENAME TO, so the table it now protects is
// no longer the one the migration that created it names. Without this, renaming
// a resource would look like losing its policy -- and the fix would be a second
// migration enabling RLS on a table that already has it.
function renamedThrough(
  migrationsDir: string,
  tables: Set<string>,
): Set<string> {
  const renames = /ALTER\s+TABLE\s+"(\w+)"\s+RENAME\s+TO\s+"(\w+)"/gi;
  const current = new Set(tables);

  for (const entry of readdirSync(migrationsDir, { withFileTypes: true }).sort(
    (left, right) => left.name.localeCompare(right.name),
  )) {
    const file = path.join(migrationsDir, entry.name, 'migration.sql');

    if (!entry.isDirectory() || !existsSync(file)) {
      continue;
    }

    for (const match of readFileSync(file, 'utf8').matchAll(renames)) {
      if (current.delete(match[1]!)) {
        current.add(match[2]!);
      }
    }
  }

  return current;
}
