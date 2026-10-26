import { execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import { APP_MODULE, unwireModule } from '../lib/app-module-patch';
import { findModule, loadModules } from '../lib/module-discovery';
import {
  modulePackageName,
  unwireDeclaredModule,
} from '../lib/hery-config-patch';
import { recordModelFields } from '../lib/module-patches';
import { isInstalledPackage, moduleCopyState } from '../lib/module-packages';
import { moduleSchemaFile, removeModelFields } from '../lib/schema-patch';
import { schemaFileDeclaring } from '@heryjs/core/technical/prisma/schema-files';

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
 * elsewhere in this framework. So uninstalling automates the parts that are
 * mechanical -- the module's own npm dependencies, its line in AppModule, its
 * own schema file and the fields it named on models it does not own -- and
 * leaves the rest as an explicit, honest list. Applied migrations stay
 * applied: dropping a table is a migration the developer writes, not a side
 * effect of this command.
 */
function projectDependsOn(name: string): boolean {
  const manifest = JSON.parse(
    readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'),
  ) as { dependencies?: Record<string, string> };

  return manifest.dependencies?.[name] !== undefined;
}

export function registerUninstallCommand(program: Command): void {
  program
    .command('uninstall <module>')
    .description(
      "Remove a module's own dependencies, its hery.config.ts entry, any AppModule import and its Prisma models and fields, and print what to clean up by hand (see hery module:list)",
    )
    .action(async (name: string) => {
      const module = findModule(loadModules(), name);

      if (!module) {
        console.log(
          pc.red(
            `✖ no module named "${name}", run "hery module:list" to see what is available`,
          ),
        );
        process.exitCode = 1;
        return;
      }

      const copy = moduleCopyState(
        process.cwd(),
        module.dest,
        path.join(module.packageDir, 'src', 'runtime'),
      );

      if (copy.copied && copy.modified.length > 0) {
        console.log(
          pc.red(
            `✖ ${module.dest} is not the copy hery install made of ${module.name}, nothing was uninstalled. Revert or move these files first:`,
          ),
        );
        copy.modified.forEach((file) => console.log(`  ${file}`));
        process.exitCode = 1;
        return;
      }

      const ownPackage = projectDependsOn(`@heryjs/${module.name}`)
        ? `@heryjs/${module.name}`
        : undefined;

      console.log(pc.cyan(`uninstalling ${module.name}...`));

      if (module.dependencies?.length) {
        const names = module.dependencies.map(packageName);
        execSync(`pnpm remove -w ${names.join(' ')}`, { stdio: 'inherit' });
        console.log(pc.green(`✔ removed ${names.join(', ')}`));
      } else {
        console.log(pc.dim(`  ${module.name} has no dependencies of its own`));
      }

      for (const file of unwireDeclaredModule(process.cwd(), {
        name: modulePackageName(module.packageDir, module.name),
        moduleName: module.name,
        dest: module.dest,
      })) {
        console.log(pc.green(`✔ removed ${module.name} from ${file}`));
      }

      const appModule = path.resolve(process.cwd(), APP_MODULE);
      const unwired = existsSync(appModule)
        ? unwireModule(readFileSync(appModule, 'utf8'), module.name)
        : undefined;

      if (unwired) {
        writeFileSync(appModule, unwired.source);
        console.log(
          pc.green(`✔ removed ${unwired.className} from ${APP_MODULE}`),
        );
      } else {
        console.log(
          pc.dim(`  ${APP_MODULE} imports nothing from ${module.name}`),
        );
      }

      if (copy.copied) {
        rmSync(path.resolve(process.cwd(), module.dest), { recursive: true });
        console.log(
          pc.green(`✔ removed ${module.dest}, unchanged since hery install`),
        );
      }

      const schemaFile = moduleSchemaFile(module.name);

      if (existsSync(schemaFile)) {
        rmSync(schemaFile);
        console.log(pc.green(`✔ removed ${schemaFile}`));
      }

      for (const write of await recordModelFields(module)) {
        const file = schemaFileDeclaring('.', write.model);

        if (
          file !== undefined &&
          removeModelFields(file, write.model, write.fields)
        ) {
          console.log(
            pc.green(
              `✔ removed the ${module.name} fields of ${write.model} from ${path.relative('.', file)}`,
            ),
          );
        }
      }

      if (ownPackage && isInstalledPackage(module.packageDir)) {
        execSync(`pnpm remove -w ${ownPackage}`, { stdio: 'inherit' });
        console.log(pc.green(`✔ removed ${ownPackage}`));
      }

      console.log('');
      console.log(pc.cyan('Left for you to do by hand:'));
      console.log(
        `  1. Review the kernel files hery install patched for ${module.name} -- they are yours now, revert whatever no longer applies`,
      );
      console.log(
        `  2. Run "pnpm hery migrate --name remove_${module.name.replaceAll('-', '_')}" to write the migration that drops the tables and columns taken out of the schema -- the migrations already applied stay as they are`,
      );
    });
}
