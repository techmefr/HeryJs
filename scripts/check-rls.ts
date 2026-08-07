import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import {
  declaredModelsIn,
  modelSetIn,
  rlsEnabledTablesIn,
  tenantModelsIn,
} from '../cli/lib/rls';

const REPO_ROOT = path.resolve(__dirname, '..');
const SCHEMA = path.join(REPO_ROOT, 'prisma', 'schema.prisma');
const MIGRATIONS = path.join(REPO_ROOT, 'prisma', 'migrations');
const PRISMA_CLIENT = path.join(
  REPO_ROOT,
  'src',
  'technical',
  'prisma',
  'prisma.client.ts',
);

/**
 * The tenant boundary is enforced twice on purpose -- once by the Prisma
 * extension, once by Postgres -- and the second half was written by hand, one
 * migration per resource, which is exactly how Team and TeamMember ended up
 * governed by the extension with no policy behind them for a month.
 *
 * So every model carrying a tenantId now has to be accounted for: covered by a
 * row-level policy, or recorded in APP_ENFORCED_TENANT_MODELS with the reason
 * it cannot be. Silence is the one thing this check does not allow.
 */
export function checkRls(): boolean {
  if (!existsSync(SCHEMA)) {
    console.error(`Found no ${path.relative(REPO_ROOT, SCHEMA)} to check.`);
    return false;
  }

  const clientSource = readFileSync(PRISMA_CLIENT, 'utf8');
  const governed = new Set(modelSetIn(clientSource, 'TENANT_SCOPED_MODELS'));
  const appEnforced = new Set(
    modelSetIn(clientSource, 'APP_ENFORCED_TENANT_MODELS'),
  );
  const tenantFree = new Set(modelSetIn(clientSource, 'TENANT_FREE_MODELS'));
  const schemaSource = readFileSync(SCHEMA, 'utf8');
  const tenantModels = tenantModelsIn(schemaSource);
  const declared = declaredModelsIn(schemaSource);
  const covered = rlsEnabledTablesIn(MIGRATIONS);
  const problems: string[] = [];

  // Multi-tenancy is the shape of the schema, not a feature added later: a new
  // table carries a tenantId, or says here why it cannot. Adding the column
  // afterwards means backfilling rows whose tenant nobody recorded.
  for (const model of declared) {
    const carriesTenant = tenantModels.some((entry) => entry.name === model);

    if (!carriesTenant && !tenantFree.has(model)) {
      problems.push(
        `${model} has no tenantId — give it one, or record it in TENANT_FREE_MODELS with the reason it cannot have one`,
      );
    }

    if (carriesTenant && tenantFree.has(model)) {
      problems.push(
        `TENANT_FREE_MODELS lists ${model}, which does carry a tenantId — decide which of the two it is`,
      );
    }
  }

  for (const model of appEnforced) {
    if (!tenantModels.some((entry) => entry.name === model)) {
      problems.push(
        `APP_ENFORCED_TENANT_MODELS lists ${model}, which has no tenantId column — the list claims a boundary the table cannot hold`,
      );
    }
  }

  if (governed.size === 0) {
    console.error(
      'Found no TENANT_SCOPED_MODELS in prisma.client.ts. This check reports success\non an empty scan, so an empty scan has to be the failure instead.',
    );
    return false;
  }

  for (const model of tenantModels) {
    const isGoverned = governed.has(model.name);
    const isAppEnforced = appEnforced.has(model.name);

    if (!isGoverned && !isAppEnforced) {
      problems.push(
        `${model.name} carries a tenantId but appears in neither TENANT_SCOPED_MODELS nor APP_ENFORCED_TENANT_MODELS — decide which, in prisma.client.ts`,
      );
      continue;
    }

    if (isGoverned && isAppEnforced) {
      problems.push(
        `${model.name} appears in both TENANT_SCOPED_MODELS and APP_ENFORCED_TENANT_MODELS — it can only be one`,
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
        `TENANT_SCOPED_MODELS lists ${model}, which has no tenantId column in the schema — the extension would stamp a column that does not exist`,
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

if (require.main === module) {
  process.exit(checkRls() ? 0 : 1);
}
