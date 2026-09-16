/**
 * Writes what `check-example-freshness` compares against. The check is the
 * authority on what a fresh example looks like, so this reuses its own
 * generation path rather than reimplementing it -- a second, drifting copy of
 * that logic is exactly the failure the check exists to prevent.
 *
 * Run it when a template change makes `pnpm run lint:example` complain, then
 * read the diff: the check says the example drifted, and only the diff says
 * whether the generator improved or broke.
 */
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { format, resolveConfig } from 'prettier';
import { loadBlueprint } from '../cli/lib/blueprint';
import { buildResourceContext } from '../cli/lib/resource-context';
import type { ResourceContext } from '../cli/lib/resource-context';
import {
  controllerFile,
  dtoFile,
  factoryFile,
  moduleFile,
  policyFile,
  presetsFile,
  recordLoaderFile,
  serviceFile,
  specFile,
  viewFile,
} from '../cli/lib/templates';

const REPO_ROOT = path.resolve(__dirname, '..');
const EXAMPLES_DIR = path.join(REPO_ROOT, 'examples');

function withOwnModuleWired(source: string, ctx: ResourceContext): string {
  return source
    .replace(
      "import { AppModule } from '#app.module';\n",
      `import { AppModule } from '#app.module';\nimport { ${ctx.pascalName}Module } from './${ctx.kebabName}.module';\n`,
    )
    .replace(
      'imports: [AppModule],',
      `imports: [AppModule, ${ctx.pascalName}Module],`,
    );
}

function generatedFiles(ctx: ResourceContext): Record<string, string> {
  return {
    [`${ctx.kebabName}.dto.ts`]: dtoFile(ctx),
    [`${ctx.kebabName}.factory.ts`]: factoryFile(ctx),
    [`${ctx.kebabName}.view.ts`]: viewFile(ctx),
    [`${ctx.kebabName}.presets.ts`]: presetsFile(ctx),
    [`${ctx.kebabName}.policy.ts`]: policyFile(ctx),
    [`${ctx.kebabName}-record.loader.ts`]: recordLoaderFile(ctx),
    [`${ctx.kebabName}.service.ts`]: serviceFile(ctx),
    [`${ctx.kebabName}.controller.ts`]: controllerFile(ctx),
    [`${ctx.kebabName}.module.ts`]: moduleFile(ctx),
    [`${ctx.kebabName}.spec.ts`]: specFile(ctx),
  };
}

async function formatted(source: string, filePath: string): Promise<string> {
  const config = await resolveConfig(filePath);
  return format(source, { ...config, filepath: filePath });
}

async function regenerateExamples(): Promise<boolean> {
  const blueprints = readdirSync(EXAMPLES_DIR).filter((entry) =>
    /\.ya?ml$/.test(entry),
  );
  let written = 0;

  for (const blueprint of blueprints) {
    const loaded = loadBlueprint(path.join(EXAMPLES_DIR, blueprint));

    if (!loaded.routed) {
      continue;
    }

    const ctx = buildResourceContext(loaded);
    const dir = path.join(EXAMPLES_DIR, ctx.kebabName);

    if (!existsSync(dir)) {
      console.error(`examples/${ctx.kebabName}/ does not exist`);
      return false;
    }

    for (const [name, content] of Object.entries(generatedFiles(ctx))) {
      const file = path.join(dir, name);
      const source =
        name === `${ctx.kebabName}.spec.ts`
          ? withOwnModuleWired(content, ctx)
          : content;

      writeFileSync(file, await formatted(source, file));
      written += 1;
    }
  }

  console.log(`✔ regenerated ${written} example files`);

  return true;
}

void regenerateExamples().then((ok) => {
  process.exitCode = ok ? 0 : 1;
});
