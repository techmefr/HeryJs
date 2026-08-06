/**
 * Regenerates every blueprint under examples/ and compares the result with the
 * committed example. The example is the only real resource this repository has
 * and the fixture its own specs hit, which is exactly why it drifts: it gets
 * edited in place when a kernel signature changes, and nothing notices that
 * `hery generate` would now produce something else. Four separate drifts had to
 * be repaired by hand before this check existed.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
  recordLoaderFile,
  serviceFile,
  specFile,
  viewFile,
} from '../cli/lib/templates';

const REPO_ROOT = path.resolve(__dirname, '..');
const EXAMPLES_DIR = path.join(REPO_ROOT, 'examples');

/**
 * A generated resource's spec assumes `hery generate`'s own "next steps" have
 * already been followed — the resource module is wired into AppModule by hand,
 * so importing AppModule is enough. The example is deliberately the one
 * resource never wired in (see examples/README.md), specifically so a fresh
 * clone ships no business domain, so its spec has to import and register its
 * own module to exercise it at all. A one-line, folder-specific edit, applied
 * here rather than by hand.
 */
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
    [`${ctx.kebabName}.policy.ts`]: policyFile(ctx),
    [`${ctx.kebabName}-record.loader.ts`]: recordLoaderFile(ctx),
    [`${ctx.kebabName}.service.ts`]: serviceFile(ctx),
    [`${ctx.kebabName}.controller.ts`]: controllerFile(ctx),
    [`${ctx.kebabName}.module.ts`]: moduleFile(ctx),
    [`${ctx.kebabName}.spec.ts`]: specFile(ctx),
  };
}

/**
 * `hery generate` emits code the developer's first lint run reformats, so the
 * committed example is prettier's output and the template's is not. Formatting
 * the generated string through the repository's own config makes the comparison
 * exact instead of approximate.
 */
async function formatted(source: string, filePath: string): Promise<string> {
  const config = await resolveConfig(filePath);
  return format(source, { ...config, filepath: filePath });
}

/**
 * The seeder is the only file here `hery generate` does not produce at all —
 * it is domain code (what to seed, with which factory), not framework scaffolding.
 * The spec used to be hand-owned too: the example's copy started from the
 * generated one and added four proofs the template didn't write — collection
 * scope parity, the trashed bin, resolved capabilities on a list, and tenant
 * spoofing through a client header. The generator now writes all four itself
 * (`specFile`), so the spec is generated like everything else above.
 */
function handOwned(ctx: ResourceContext): Set<string> {
  return new Set([`${ctx.kebabName}.seeder.ts`, 'doc-examples.spec.ts']);
}

export async function checkExampleFreshness(): Promise<boolean> {
  if (!existsSync(EXAMPLES_DIR)) {
    console.error(
      `Found no ${path.relative(REPO_ROOT, EXAMPLES_DIR)} to check.`,
    );
    return false;
  }

  const blueprints = readdirSync(EXAMPLES_DIR).filter((entry) =>
    /\.ya?ml$/.test(entry),
  );

  if (blueprints.length === 0) {
    console.error(
      `Found no blueprint in ${path.relative(REPO_ROOT, EXAMPLES_DIR)}. An example nothing can regenerate is the drift this check exists to stop.`,
    );
    return false;
  }

  const problems: string[] = [];

  for (const blueprint of blueprints) {
    const loaded = loadBlueprint(path.join(EXAMPLES_DIR, blueprint));

    // An unrouted blueprint generates nothing of its own -- it only exists to
    // be pointed at from another blueprint's includes/aggregates, so there is
    // no examples/<kebab>/ directory to compare it against.
    if (!loaded.routed) {
      continue;
    }

    const ctx = buildResourceContext(loaded);
    const dir = path.join(EXAMPLES_DIR, ctx.kebabName);

    if (!existsSync(dir)) {
      problems.push(
        `${blueprint} declares ${ctx.pascalName} but examples/${ctx.kebabName}/ does not exist`,
      );
      continue;
    }

    const expected = generatedFiles(ctx);
    const present = new Set(
      readdirSync(dir).filter((entry) => entry.endsWith('.ts')),
    );

    for (const [name, content] of Object.entries(expected)) {
      const file = path.join(dir, name);

      if (!existsSync(file)) {
        problems.push(
          `examples/${ctx.kebabName}/${name} is generated but missing`,
        );
        continue;
      }

      present.delete(name);

      const expectedContent =
        name === `${ctx.kebabName}.spec.ts`
          ? withOwnModuleWired(content, ctx)
          : content;

      if (
        readFileSync(file, 'utf8') !== (await formatted(expectedContent, file))
      ) {
        problems.push(
          `examples/${ctx.kebabName}/${name} differs from what hery generate produces`,
        );
      }
    }

    for (const name of present) {
      if (handOwned(ctx).has(name)) {
        continue;
      }

      problems.push(
        `examples/${ctx.kebabName}/${name} is neither generated nor declared hand-owned`,
      );
    }
  }

  if (problems.length > 0) {
    console.error('✖ the example has drifted from the generator:');
    for (const problem of problems) {
      console.error(`  - ${problem}`);
    }
    console.error(
      '\nRegenerate it, or if the generator is what changed, regenerate and commit the result.',
    );
    return false;
  }

  console.log(
    `✔ every example matches hery generate (${blueprints.length} blueprints)`,
  );
  return true;
}

if (require.main === module) {
  void checkExampleFreshness().then((passed) => process.exit(passed ? 0 : 1));
}
