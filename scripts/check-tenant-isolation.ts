import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { loadOfficialModules } from '../cli/lib/module-discovery';

const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * Every module must prove, in a spec of its own, that one tenant can neither
 * read nor change another tenant's data. The proof is found by convention: a
 * spec holding a `describe('tenant isolation', ...)` block. Both copies of a
 * module are checked, the authored one under packages/ and the installed one,
 * so an installed module cannot lose the proof its package still has. A module
 * whose destination is a shared kernel directory owns no folder of its own
 * there, so only its package copy is checked.
 */
export const TENANT_ISOLATION_BLOCK =
  /\bdescribe\(\s*['"`]tenant isolation['"`]/;

function specsUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'dist') {
      return [];
    }

    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return specsUnder(full);
    }

    return entry.name.endsWith('.spec.ts') ? [full] : [];
  });
}

function provesIsolation(dir: string): boolean {
  return specsUnder(dir).some((file) =>
    TENANT_ISOLATION_BLOCK.test(readFileSync(file, 'utf8')),
  );
}

export function checkTenantIsolation(): boolean {
  const directories = loadOfficialModules().flatMap((module) => {
    const installed = path.resolve(REPO_ROOT, module.dest);
    const ownsItsDestination = !module.dest.startsWith('src/technical');

    return ownsItsDestination && existsSync(installed)
      ? [module.packageDir, installed]
      : [module.packageDir];
  });

  const missing = directories.filter((dir) => !provesIsolation(dir));

  if (missing.length > 0) {
    console.error(
      "Every module needs a spec with a describe('tenant isolation', ...) block proving tenant A can neither read nor change tenant B's data:\n",
    );
    missing.forEach((dir) =>
      console.error(`  ${path.relative(REPO_ROOT, dir)}`),
    );
    return false;
  }

  console.log(
    `✔ every module proves tenant isolation (${directories.length} module copies checked)`,
  );

  return true;
}
