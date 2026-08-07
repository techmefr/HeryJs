import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { rewriteKernelSpecifiers } from '../cli/lib/runtime-copy';

const REPO_ROOT = path.resolve(__dirname, '..');
const PACKAGES = path.join(REPO_ROOT, 'packages');
const DEST_DIR = /const DEST_DIR = '([^']+)'/;

interface ModulePackage {
  name: string;
  runtimeDir: string;
  destDir: string;
}

function modulePackages(): ModulePackage[] {
  if (!existsSync(PACKAGES)) {
    return [];
  }

  return readdirSync(PACKAGES, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const moduleFile = path.join(PACKAGES, entry.name, 'src', 'module.ts');
      const runtimeDir = path.join(PACKAGES, entry.name, 'src', 'runtime');

      if (!existsSync(moduleFile) || !existsSync(runtimeDir)) {
        return [];
      }

      const dest = DEST_DIR.exec(readFileSync(moduleFile, 'utf8'));

      return dest
        ? [{ name: entry.name, runtimeDir, destDir: dest[1]! }]
        : [{ name: entry.name, runtimeDir, destDir: '' }];
    });
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

/**
 * Only prettier's own choices are normalised away, because the two copies are
 * not formatted by the same pass: `#technical/` is longer than `#kernel/`, so an
 * import that fits on one line where it is authored wraps where it is installed,
 * and prettier then adds a trailing comma and a leading union bar it would not
 * have added otherwise. The admin runtime is not even linted here, so its copy
 * is formatted only once it lands in the `admin` workspace.
 *
 * What is deliberately *not* normalised is anything a developer writes: an
 * identifier, a string, an added line, a removed argument. Those are the drift
 * this check exists to catch.
 */
function normalized(source: string): string {
  return source
    .replace(/,(\s*[}\])])/g, '$1')
    .replace(/\s+/g, ' ')
    .replace(/(\bas\b|[:=(,]) \|/g, '$1')
    .trim();
}

// A module's own spec does not ship: the authored package has no #app.module to
// boot and no devtools/testing to register a user through, so the spec can only
// live where the app does. It is named here rather than passed over silently --
// the consequence is real, an installed module arrives with no test of its own.
function isSpec(file: string): boolean {
  return file.endsWith('.spec.ts');
}

// Astro's build cache and the workspace's installed dependencies, both under the
// admin directory. Written by the tooling, never authored, never installed.
function isBuildArtifact(relative: string): boolean {
  const segments = relative.split(path.sep);

  return (
    segments.includes('.astro') ||
    segments.includes('node_modules') ||
    segments.includes('dist')
  );
}

/**
 * The other direction, and it only works where a directory belongs to the module
 * outright: `src/modules/<name>` and the `admin` workspace. A module that drops
 * files into a shared kernel folder -- impersonation's two exceptions in
 * technical/errors, the search drivers in technical/search -- cannot be checked
 * this way, because nothing in a path distinguishes its file from the kernel's
 * own. Those are covered in the authored-to-installed direction only.
 */
function ownedInstalledFiles(module: ModulePackage): string[] {
  const owned = [
    path.join(REPO_ROOT, 'src', 'modules', module.name),
    path.join(REPO_ROOT, module.destDir),
  ].filter(
    (dir) =>
      existsSync(dir) &&
      (dir.endsWith(path.join('modules', module.name)) ||
        module.destDir === 'admin'),
  );

  return [...new Set(owned)].flatMap((dir) =>
    filesUnder(dir).filter(
      (file) => !isBuildArtifact(path.relative(dir, file)),
    ),
  );
}

/**
 * A module exists twice: authored under packages/<name>/src/runtime, installed
 * under the path its own module.ts copies it to -- and this repository keeps the
 * installed copy, so every convention check, every reader and every test sees
 * that one. Editing one copy and not the other leaves the whole gate green while
 * the published module is broken, which is exactly the mistake nothing here
 * could catch until now.
 */
export function checkModuleDrift(): boolean {
  const packages = modulePackages();

  if (packages.length === 0) {
    console.error(
      'Found no module package under packages/. This check reports success on an\nempty scan, so an empty scan has to be the failure instead.',
    );
    return false;
  }

  const problems: string[] = [];
  let compared = 0;
  let notInstalled = 0;
  let unshippedSpecs = 0;

  for (const module of packages) {
    if (module.destDir === '') {
      problems.push(
        `packages/${module.name}/src/module.ts declares no DEST_DIR literal — this check cannot tell where its runtime lands`,
      );
      continue;
    }

    for (const authored of filesUnder(module.runtimeDir)) {
      const relative = path.relative(module.runtimeDir, authored);
      const installed = path.join(REPO_ROOT, module.destDir, relative);

      if (!existsSync(installed) || !statSync(installed).isFile()) {
        notInstalled += 1;
        continue;
      }

      compared += 1;

      if (
        normalized(rewriteKernelSpecifiers(readFileSync(authored, 'utf8'))) !==
        normalized(readFileSync(installed, 'utf8'))
      ) {
        problems.push(
          `${path.relative(REPO_ROOT, installed)} has drifted from ${path.relative(REPO_ROOT, authored)} — edit both copies, they are the same file`,
        );
      }
    }

    for (const installed of ownedInstalledFiles(module)) {
      const authored = path.join(
        module.runtimeDir,
        module.destDir === 'admin'
          ? path.relative(path.join(REPO_ROOT, 'admin'), installed)
          : path.relative(path.join(REPO_ROOT, module.destDir), installed),
      );

      if (existsSync(authored)) {
        continue;
      }

      if (isSpec(installed)) {
        unshippedSpecs += 1;
        continue;
      }

      problems.push(
        `${path.relative(REPO_ROOT, installed)} exists here but not in packages/${module.name} — a project installing this module never gets it`,
      );
    }
  }

  if (problems.length > 0) {
    console.error('Module copies that no longer say the same thing:\n');
    problems.forEach((problem) => console.error(`  ${problem}`));
    console.error(
      '\nThe installed copy is what this repository runs and tests; the authored copy\nunder packages/ is what a project gets from "hery install". A fix applied to\none of them only is a fix the other still needs.',
    );
    return false;
  }

  console.log(
    `✔ every installed module matches the module it was installed from (${compared} files compared across ${packages.length} packages, ${notInstalled} not installed here, ${unshippedSpecs} specs that stay behind)`,
  );

  return true;
}

if (require.main === module) {
  process.exit(checkModuleDrift() ? 0 : 1);
}
