import { execSync } from 'node:child_process';
import type { Command } from 'commander';
import pc from 'picocolors';
import { getModule } from '../lib/module-registry';
import { loadModules } from '../lib/module-discovery';

// module.dependencies holds pnpm-add specs ("@elastic/elasticsearch@^8.17.0"),
// but "pnpm remove" takes bare package names -- a version suffix there is a
// syntax error, not a no-op.
function packageName(spec: string): string {
  const searchFrom = spec.startsWith('@') ? 1 : 0;
  const at = spec.indexOf('@', searchFrom);
  return at === -1 ? spec : spec.slice(0, at);
}

/**
 * `install()` copies runtime files into the project and patches a handful of
 * kernel files -- both become code the project owns the moment generation
 * finishes, possibly edited since. Reversing either automatically would mean
 * guessing whether what is on disk today still matches what was generated,
 * which is exactly the kind of silent rewrite "own your code" rules out
 * elsewhere in this framework. So uninstalling only ever automates the part
 * that is safe to automate outright -- the module's own npm dependencies,
 * nothing this project's developer could have touched -- and leaves the rest
 * as an explicit, honest list of what to remove by hand.
 */
export function registerUninstallCommand(program: Command): void {
  program
    .command('uninstall <module>')
    .description(
      "Remove a module's own dependencies and print what to clean up by hand (see hery module:list)",
    )
    .action((name: string) => {
      loadModules();
      const module = getModule(name);

      if (!module) {
        console.log(
          pc.red(
            `✖ no module named "${name}", run "hery module:list" to see what is available`,
          ),
        );
        process.exitCode = 1;
        return;
      }

      console.log(pc.cyan(`uninstalling ${module.name}...`));

      if (module.dependencies?.length) {
        const names = module.dependencies.map(packageName);
        execSync(`pnpm remove -w ${names.join(' ')}`, { stdio: 'inherit' });
      }

      if (module.uninstall) {
        void module.uninstall();
      }

      console.log(pc.green(`✔ ${module.name}'s own dependencies removed`));
      console.log('');
      console.log(pc.cyan('Left for you to do by hand:'));
      console.log(
        `  1. Remove ${pc.bold(`${module.name}Module`)}'s import from src/app.module.ts`,
      );
      console.log(
        '  2. Review the files hery install copied or patched for this module -- they are yours now, delete or revert whatever no longer applies',
      );
      console.log(
        '  3. If it added a Prisma model or field, write and run the migration that drops it',
      );
    });
}
