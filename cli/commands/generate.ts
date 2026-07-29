import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { parseArgv } from '../lib/argv';
import { loadBlueprint } from '../lib/blueprint';
import { kebabCase } from '../lib/naming';
import { buildResourceContext } from '../lib/resource-context';
import {
  patchPrismaSchema,
  patchTenantScopedModels,
} from '../lib/schema-patch';
import {
  controllerFile,
  dtoFile,
  moduleFile,
  policyFile,
  recordLoaderFile,
  serviceFile,
  specFile,
} from '../lib/templates';

export function runGenerate(argv: string[]): void {
  const { positional, flags } = parseArgv(argv);
  const name = positional[0];

  if (!name) {
    console.error('Usage: hery generate <Name> [--force]');
    process.exitCode = 1;
    return;
  }

  const root = process.cwd();
  const blueprintPath = path.join(
    root,
    'blueprints',
    `${kebabCase(name)}.yaml`,
  );

  if (!existsSync(blueprintPath)) {
    console.error(
      `No blueprint found at ${blueprintPath}. Run "hery create:blueprint ${name}" first.`,
    );
    process.exitCode = 1;
    return;
  }

  const blueprint = loadBlueprint(blueprintPath);
  const ctx = buildResourceContext(blueprint);

  const targetDir = path.join(root, 'src', 'functional', ctx.kebabName);

  if (existsSync(targetDir) && !flags.force) {
    console.error(`${targetDir} already exists. Pass --force to overwrite.`);
    process.exitCode = 1;
    return;
  }

  mkdirSync(targetDir, { recursive: true });

  const files: Record<string, string> = {
    [`${ctx.kebabName}.dto.ts`]: dtoFile(ctx),
    [`${ctx.kebabName}.policy.ts`]: policyFile(ctx),
    [`${ctx.kebabName}-record.loader.ts`]: recordLoaderFile(ctx),
    [`${ctx.kebabName}.service.ts`]: serviceFile(ctx),
    [`${ctx.kebabName}.controller.ts`]: controllerFile(ctx),
    [`${ctx.kebabName}.module.ts`]: moduleFile(ctx),
    [`${ctx.kebabName}.spec.ts`]: specFile(ctx),
  };

  for (const [fileName, content] of Object.entries(files)) {
    writeFileSync(path.join(targetDir, fileName), content);
  }

  const schemaPath = path.join(root, 'prisma', 'schema.prisma');
  const prismaClientPath = path.join(
    root,
    'src',
    'technical',
    'prisma',
    'prisma.client.ts',
  );

  patchPrismaSchema(schemaPath, ctx);
  patchTenantScopedModels(prismaClientPath, ctx.pascalName);

  console.log(`Generated ${ctx.pascalName} in ${targetDir}`);
  console.log('Next steps:');
  console.log(`  1. Import ${ctx.pascalName}Module into src/app.module.ts`);
  console.log(
    `  2. Run "npm run hery -- migrate --name add_${ctx.kebabName}" to create the migration`,
  );
}
