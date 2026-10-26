import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import {
  annotatedModelsIn,
  registriesFrom,
} from '@heryjs/core/technical/prisma/model-annotations';
import {
  rlsEnabledTablesIn,
  tenantModelsIn,
  type TenantModel,
} from '@heryjs/core/technical/prisma/rls-schema';
import { readPrismaSchema } from '@heryjs/core/technical/prisma/schema-files';

export {
  declaredModelsIn,
  rlsEnabledTablesIn,
  tenantModelsIn,
  type TenantModel,
} from '@heryjs/core/technical/prisma/rls-schema';

/** The models the schema annotates `/// @hery.tenantScoped`. */
export function tenantScopedModelsIn(schemaSource: string): string[] {
  return [...registriesFrom(annotatedModelsIn(schemaSource)).tenantScoped];
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
 * annotates the model it writes `/// @hery.tenantScoped`, so this is what
 * turns that annotation into the matching migration instead of leaving it to
 * be remembered -- which is how the teams tables went a month without one.
 */
export function pendingRlsModels(root: string): TenantModel[] {
  const source = readPrismaSchema(root);

  if (source === undefined) {
    return [];
  }

  const governed = new Set(tenantScopedModelsIn(source));
  const covered = rlsEnabledTablesIn(path.join(root, 'prisma', 'migrations'));

  return tenantModelsIn(source).filter(
    (model) => governed.has(model.name) && !covered.has(model.name),
  );
}

const MIGRATION_PREFIX = /^\d{14}/;

/**
 * Prisma applies migrations in directory-name order, so a policy migration has
 * to sort after the one that created the tables it locks down. On a project's
 * first `hery migrate` both are written within the same second, and
 * `..._enable_rls_team` sorts before `..._init`: the policies then ran against
 * tables that did not exist yet, and the very first migration of a scaffolded
 * project failed.
 */
export function afterEveryMigration(
  migrationsDir: string,
  timestamp: string,
): string {
  const latest = existsSync(migrationsDir)
    ? readdirSync(migrationsDir)
        .map((entry) => MIGRATION_PREFIX.exec(entry)?.[0])
        .filter((prefix): prefix is string => prefix !== undefined)
        .sort()
        .at(-1)
    : undefined;

  if (latest === undefined || timestamp > latest) {
    return timestamp;
  }

  return migrationTimestamp(
    new Date(
      Date.UTC(
        Number(latest.slice(0, 4)),
        Number(latest.slice(4, 6)) - 1,
        Number(latest.slice(6, 8)),
        Number(latest.slice(8, 10)),
        Number(latest.slice(10, 12)),
        Number(latest.slice(12, 14)) + 1,
      ),
    ),
  );
}

const MAX_SUFFIX_LENGTH = 80;

/**
 * Named after the tables it locks down while that stays readable. A fresh
 * project's first migrate covers every kernel table at once, and the joined
 * names ran past the 255-byte limit on a directory name: `mkdir` failed with
 * ENAMETOOLONG on the very command the getting-started path gives.
 */
export function rlsMigrationSuffix(models: TenantModel[]): string {
  const joined = models.map((model) => model.name.toLowerCase()).join('_');

  if (joined.length <= MAX_SUFFIX_LENGTH) {
    return `enable_rls_${joined}`;
  }

  return `enable_rls_${models.length}_tables`;
}

export function writeRlsMigration(
  root: string,
  models: TenantModel[],
  timestamp: string,
): string {
  const migrationsDir = path.join(root, 'prisma', 'migrations');
  const name = `${afterEveryMigration(migrationsDir, timestamp)}_${rlsMigrationSuffix(models)}`;
  const dir = path.join(migrationsDir, name);

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
