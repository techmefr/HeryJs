import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';

/**
 * Every module must prove, in a spec of its own, that one tenant can neither
 * read nor change another tenant's data. The proof is found by convention: a
 * spec holding a `describe('tenant isolation', ...)` block. A project checks
 * the modules it installed under src/modules; the framework passes both copies
 * of each module, the authored one under packages/ and the installed one.
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

export function installedModuleDirs(repoRoot: string): string[] {
  const modules = path.join(repoRoot, 'src', 'modules');

  if (!existsSync(modules)) {
    return [];
  }

  return readdirSync(modules, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(modules, entry.name));
}

export function checkTenantIsolation(
  repoRoot: string,
  directories: string[] = installedModuleDirs(repoRoot),
): boolean {
  const missing = directories.filter((dir) => !provesIsolation(dir));

  if (missing.length > 0) {
    console.error(
      "Every module needs a spec with a describe('tenant isolation', ...) block proving tenant A can neither read nor change tenant B's data:\n",
    );
    missing.forEach((dir) =>
      console.error(`  ${path.relative(repoRoot, dir)}`),
    );
    return false;
  }

  console.log(
    `✔ every module proves tenant isolation (${directories.length} module copies checked)`,
  );

  return true;
}
