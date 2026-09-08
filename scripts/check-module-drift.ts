import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { rewriteKernelSpecifiers } from '../cli/lib/runtime-copy';
import { loadOfficialModules } from '../cli/lib/module-discovery';

const REPO_ROOT = path.resolve(__dirname, '..');

interface ModulePackage {
  name: string;
  runtimeDir: string;
  destDir: string;
}

/**
 * Where a module's runtime lands is a field of its definition, so this reads
 * the definition rather than grepping the source for a local constant -- a
 * module whose destination this check cannot see is a module whose two copies
 * it silently stops comparing.
 */
function modulePackages(): ModulePackage[] {
  return loadOfficialModules().flatMap((module) => {
    const runtimeDir = path.join(module.packageDir, 'src', 'runtime');

    return existsSync(runtimeDir)
      ? [{ name: module.name, runtimeDir, destDir: module.dest }]
      : [];
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

// A module ships a spec of its own under src/runtime, and copyRuntime copies it
// in like any other file -- so the two copies of that one are compared like any
// other file. What this tolerates is the spec that exists only app-side: an
// integration spec booting #app.module and registering a user through
// devtools/testing cannot be authored in a package that has neither, so nothing
// on the authored side corresponds to it.
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
  let appSideSpecs = 0;

  for (const module of packages) {
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
        appSideSpecs += 1;
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
    `✔ every installed module matches the module it was installed from (${compared} files compared across ${packages.length} packages, ${notInstalled} not installed here, ${appSideSpecs} app-side specs with no authored counterpart)`,
  );

  return true;
}

if (require.main === module) {
  process.exit(checkModuleDrift() ? 0 : 1);
}
