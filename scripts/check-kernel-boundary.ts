import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';
import {
  KERNEL_PUBLIC_DIR,
  KERNEL_PUBLIC_ENTRIES,
  KERNEL_SPECIFIER,
  internalKernelImportProblem,
  isOwnKernelFile,
  isPublicKernelSpecifier,
} from '../cli/lib/kernel-public-api';
import { loadOfficialModules } from '../cli/lib/module-discovery';

const REPO_ROOT = path.resolve(__dirname, '..');
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', '.astro']);
const KERNEL_LITERAL = /['"]((?:#kernel|@heryjs\/core)\/[^'"]*)['"]/g;

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name) ? [] : sourceFiles(full);
    }

    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

function authoredPackages(): Array<{
  packageDir: string;
  runtimeDir: string;
  dest: string;
}> {
  const official = loadOfficialModules().map((module) => ({
    packageDir: module.packageDir,
    runtimeDir: path.join(module.packageDir, 'src', 'runtime'),
    dest: module.dest,
  }));
  const examples = readdirSync(path.join(REPO_ROOT, 'examples'), {
    withFileTypes: true,
  })
    .filter(
      (entry) => entry.isDirectory() && entry.name.startsWith('hery-module-'),
    )
    .map((entry) => {
      const packageDir = path.join(REPO_ROOT, 'examples', entry.name);

      return {
        packageDir,
        runtimeDir: path.join(packageDir, 'src', 'runtime'),
        dest: path.join('src', 'modules', entry.name),
      };
    });

  return [...official, ...examples];
}

/**
 * A module reaches the kernel only through the entries of @heryjs/core, built
 * from src/technical/public. Every #kernel/ and @heryjs/core/ string a package
 * holds is checked, not
 * only its imports: a jest.mock or a requireActual on an internal path couples
 * a spec to a file the kernel is free to move.
 */
export function checkKernelBoundary(): boolean {
  const problems: string[] = [];
  const publicDir = path.join(REPO_ROOT, KERNEL_PUBLIC_DIR);
  const declared = new Set<string>(KERNEL_PUBLIC_ENTRIES);
  const present = readdirSync(publicDir)
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
    .map((file) => file.replace(/\.ts$/, ''));

  present
    .filter((entry) => !declared.has(entry))
    .forEach((entry) =>
      problems.push(
        `${KERNEL_PUBLIC_DIR}/${entry}.ts is not listed in KERNEL_PUBLIC_ENTRIES (cli/lib/kernel-public-api.ts)`,
      ),
    );
  [...declared]
    .filter((entry) => !present.includes(entry))
    .forEach((entry) =>
      problems.push(
        `KERNEL_PUBLIC_ENTRIES lists ${entry}, but ${KERNEL_PUBLIC_DIR}/${entry}.ts does not exist`,
      ),
    );

  let scanned = 0;

  for (const pkg of authoredPackages()) {
    for (const file of sourceFiles(pkg.packageDir)) {
      scanned += 1;

      for (const match of readFileSync(file, 'utf8').matchAll(KERNEL_LITERAL)) {
        const specifier = match[1] ?? KERNEL_SPECIFIER;

        if (
          !isPublicKernelSpecifier(specifier) &&
          !isOwnKernelFile(specifier, pkg.runtimeDir, pkg.dest)
        ) {
          problems.push(
            internalKernelImportProblem(
              path.relative(REPO_ROOT, file),
              specifier,
            ),
          );
        }
      }
    }
  }

  if (problems.length > 0) {
    problems.forEach((problem) => console.error(pc.red(`✖ ${problem}`)));
    console.error(
      '\nExport what the module needs from the matching entry under src/technical/public,\nthen import it from there. The snapshot in cli/lib/kernel-public-api.spec.ts records the change.',
    );

    return false;
  }

  console.log(
    pc.green(
      `✔ every module reaches the kernel through its ${declared.size} public entries (${scanned} files checked)`,
    ),
  );

  return true;
}
