import * as path from 'node:path';
import {
  annotatedModelsIn,
  registriesFrom,
} from '../../technical/prisma/model-annotations';
import {
  declaredModelsIn,
  rlsEnabledTablesIn,
  tenantModelsIn,
} from '../../technical/prisma/rls-schema';
import {
  PRISMA_SCHEMA_DIR,
  readPrismaSchema,
} from '../../technical/prisma/schema-files';

/**
 * The tenant boundary is enforced twice on purpose -- once by the Prisma
 * extension, once by Postgres -- and the second half was written by hand, one
 * migration per resource, which is exactly how Team and TeamMember ended up
 * governed by the extension with no policy behind them for a month.
 *
 * So every model carrying a tenantId now has to be accounted for: covered by a
 * row-level policy, or annotated `/// @hery.appEnforcedTenant <reason>` with
 * the reason it cannot be. Silence is the one thing this check does not allow.
 */
export function checkRls(repoRoot: string): boolean {
  const migrationsDir = path.join(repoRoot, 'prisma', 'migrations');
  const schemaSource = readPrismaSchema(repoRoot);

  if (schemaSource === undefined) {
    console.error(`Found no ${PRISMA_SCHEMA_DIR} to check.`);
    return false;
  }

  const registries = registriesFrom(annotatedModelsIn(schemaSource));
  const governed = registries.tenantScoped;
  const appEnforced = registries.appEnforcedTenant;
  const tenantFree = registries.tenantFree;
  const tenantModels = tenantModelsIn(schemaSource);
  const declared = declaredModelsIn(schemaSource);
  const covered = rlsEnabledTablesIn(migrationsDir);
  const problems: string[] = [];

  // Multi-tenancy is the shape of the schema, not a feature added later: a new
  // table carries a tenantId, or says here why it cannot. Adding the column
  // afterwards means backfilling rows whose tenant nobody recorded.
  for (const model of declared) {
    const carriesTenant = tenantModels.some((entry) => entry.name === model);

    if (!carriesTenant && !tenantFree.has(model)) {
      problems.push(
        `${model} has no tenantId — give it one, or annotate it /// @hery.tenantFree <the reason it cannot have one>`,
      );
    }

    if (carriesTenant && tenantFree.has(model)) {
      problems.push(
        `${model} is @hery.tenantFree but does carry a tenantId — decide which of the two it is`,
      );
    }
  }

  for (const model of appEnforced) {
    if (!tenantModels.some((entry) => entry.name === model)) {
      problems.push(
        `${model} is @hery.appEnforcedTenant but has no tenantId column — the annotation claims a boundary the table cannot hold`,
      );
    }
  }

  if (governed.size === 0) {
    console.error(
      'Found no /// @hery.tenantScoped model in prisma/schema/. This check reports\nsuccess on an empty scan, so an empty scan has to be the failure instead.',
    );
    return false;
  }

  for (const model of tenantModels) {
    const isGoverned = governed.has(model.name);
    const isAppEnforced = appEnforced.has(model.name);

    if (!isGoverned && !isAppEnforced) {
      problems.push(
        `${model.name} carries a tenantId but is neither /// @hery.tenantScoped nor /// @hery.appEnforcedTenant <reason> — decide which, in prisma/schema/`,
      );
      continue;
    }

    if (isGoverned && isAppEnforced) {
      problems.push(
        `${model.name} is both @hery.tenantScoped and @hery.appEnforcedTenant — it can only be one`,
      );
      continue;
    }

    if (isGoverned && !covered.has(model.name)) {
      problems.push(
        `${model.name} is tenant-scoped in the Prisma extension but no migration enables row level security on it — run "pnpm hery migrate" to emit the policy`,
      );
    }
  }

  for (const model of governed) {
    if (!tenantModels.some((entry) => entry.name === model)) {
      problems.push(
        `${model} is @hery.tenantScoped but has no tenantId column in the schema — the extension would stamp a column that does not exist`,
      );
    }
  }

  if (problems.length > 0) {
    console.error('Tenant tables with no second line of defence:\n');
    problems.forEach((problem) => console.error(`  ${problem}`));
    console.error(
      '\nThe extension filters every query by tenant, but it is application code:\na raw query, a missed operation or a future refactor goes around it. The\nPostgres policy is what still holds when it does.',
    );
    return false;
  }

  console.log(
    `✔ every table is accounted for (${governed.size} covered by a row-level policy, ${appEnforced.size} enforced in code, ${tenantFree.size} tenant-free with a recorded reason)`,
  );

  return true;
}
