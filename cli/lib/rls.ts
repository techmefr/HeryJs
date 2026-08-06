import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import * as path from 'node:path';

const MODEL_BLOCK = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
const TENANT_FIELD = /^\s*tenantId\s+String(\?)?/m;
const ENABLED_TABLE =
  /ALTER\s+TABLE\s+"(\w+)"\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;
const MODEL_SET = (name: string) =>
  new RegExp(`const ${name} = new Set\\(\\[([^\\]]*)\\]\\)`);

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

export function modelSetIn(source: string, setName: string): string[] {
  // Comments go first: an apostrophe in one of them (better-auth's own adapter)
  // is indistinguishable from a quote once the entries are read by pattern.
  const match = MODEL_SET(setName).exec(source.replace(/\/\/[^\n]*/g, ''));

  if (!match) {
    return [];
  }

  return [...(match[1] ?? '').matchAll(/'([^']+)'/g)].map((entry) => entry[1]!);
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

/**
 * A nullable tenantId means the table also holds rows belonging to no tenant --
 * a global feature flag, for instance -- so the policy has to admit them
 * explicitly. Left out, they would become invisible to every tenant.
 */
export function rlsSqlFor(models: TenantModel[]): string {
  const header = `-- Row-level security for the tables the tenant-scoped Prisma client governs.
-- The application already filters every query by tenant; this is the second
-- line, enforced by Postgres itself for any role that does not own the table
-- with BYPASSRLS. current_setting('app.tenant_id', true) is NULL when unset,
-- and "tenantId" = NULL is never true, so an unset session variable hides
-- every row rather than exposing them: the policy fails closed.
`;

  const blocks = models.map((model) => {
    const tenantMatch = model.optional
      ? `("tenantId" IS NULL OR "tenantId" = current_setting('app.tenant_id', true))`
      : `("tenantId" = current_setting('app.tenant_id', true))`;

    return `
ALTER TABLE "${model.name}" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "${model.name}" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "${model.name}"
  USING ${tenantMatch}
  WITH CHECK ${tenantMatch};
`;
  });

  return `${header}${blocks.join('')}`;
}

/**
 * The tenant-scoped models whose table has no policy yet. `hery generate`
 * patches TENANT_SCOPED_MODELS for the resource it writes, so this is what
 * turns that patch into the matching migration instead of leaving it to be
 * remembered -- which is how the teams tables went a month without one.
 */
export function pendingRlsModels(root: string): TenantModel[] {
  const schema = path.join(root, 'prisma', 'schema.prisma');
  const clientPath = path.join(
    root,
    'src',
    'technical',
    'prisma',
    'prisma.client.ts',
  );

  if (!existsSync(schema) || !existsSync(clientPath)) {
    return [];
  }

  const governed = new Set(
    modelSetIn(readFileSync(clientPath, 'utf8'), 'TENANT_SCOPED_MODELS'),
  );
  const covered = rlsEnabledTablesIn(path.join(root, 'prisma', 'migrations'));

  return tenantModelsIn(readFileSync(schema, 'utf8')).filter(
    (model) => governed.has(model.name) && !covered.has(model.name),
  );
}

export function writeRlsMigration(
  root: string,
  models: TenantModel[],
  timestamp: string,
): string {
  const name = `${timestamp}_enable_rls_${models
    .map((model) => model.name.toLowerCase())
    .join('_')}`;
  const dir = path.join(root, 'prisma', 'migrations', name);

  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'migration.sql'), rlsSqlFor(models));

  return dir;
}

export function migrationTimestamp(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');

  return [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds()),
  ].join('');
}
