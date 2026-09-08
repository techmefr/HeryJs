import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';
import { loadOfficialModules } from '../cli/lib/module-discovery';
import { missingMarks, recordPatches } from '../cli/lib/module-patches';
import type { PatchRecord } from '../cli/lib/module-patches';
import type { LoadedModule } from '../cli/lib/module-definition';

const REPO_ROOT = path.resolve(__dirname, '..');

function read(file: string): string | undefined {
  const full = path.join(REPO_ROOT, file);

  return existsSync(full) ? readFileSync(full, 'utf8') : undefined;
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

/**
 * Whether this project holds the module's runtime, not whether its destination
 * exists: three modules land in a directory the kernel owns anyway
 * (`src/technical`, `src/technical/search`, `src` itself), so a check keyed on
 * the destination counted every one of them as installed and then looked for
 * patches nothing had ever applied.
 */
function isInstalled(module: LoadedModule): boolean {
  const runtimeDir = path.join(module.packageDir, 'src', 'runtime');

  if (!existsSync(runtimeDir)) {
    return false;
  }

  return filesUnder(runtimeDir)
    .filter((file) => !file.endsWith('.spec.ts'))
    .some((file) =>
      existsSync(
        path.join(REPO_ROOT, module.dest, path.relative(runtimeDir, file)),
      ),
    );
}

/**
 * The drift check compares a module's own runtime against the copy an install
 * left behind, in both directions. What no check covered is the other half of
 * an install: the kernel files a module patches. Those are not copies of
 * anything, so nothing compared them, and a patch whose search text the kernel
 * has moved past is silently skipped rather than reported -- which is how a
 * module went on declaring a value the kernel had stopped reading.
 *
 * Only modules installed in this project are checked: a module whose
 * destination is absent has left no mark to look for.
 */
export async function checkModulePatches(): Promise<boolean> {
  const installed = loadOfficialModules().filter(isInstalled);

  const records: PatchRecord[] = [];

  for (const module of installed) {
    records.push(...(await recordPatches(module)));
  }

  const problems = missingMarks(records, read);

  problems.forEach((problem) => console.error(pc.red(`✖ ${problem}`)));

  if (problems.length > 0) {
    console.error(
      '\nEither the module has to patch what the kernel says now, or the kernel\nhas to keep what the module extends. A skipped patch is not a third option.',
    );

    return false;
  }

  console.log(
    pc.green(
      `✔ ${records.length} patches from ${installed.length} installed modules are still in place`,
    ),
  );

  return true;
}
