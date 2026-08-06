import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import { loadBlueprint, resolveBlueprintPath } from '../lib/blueprint';
import { buildResourceContext } from '../lib/resource-context';
import { patchModelSet, patchPrismaSchema } from '../lib/schema-patch';
import {
  controllerFile,
  dtoFile,
  factoryFile,
  liveGatewayFile,
  mcpToolsFile,
  moduleFile,
  policyFile,
  presetsFile,
  recordLoaderFile,
  resolverFile,
  serviceFile,
  specFile,
  streamControllerFile,
  viewFile,
} from '../lib/templates';

export function registerGenerateCommand(program: Command): void {
  program
    .command('generate <name>')
    .description('Generate a resource from its blueprint')
    .option('-f, --force', 'Overwrite an existing resource directory')
    .option(
      '--graphql',
      'also generate a GraphQL resolver (requires the "graphql" module to be installed)',
    )
    .option(
      '--mcp',
      'also generate an MCP tool registrar (requires the "mcp" module to be installed)',
    )
    .option(
      '--live',
      'also generate a live WebSocket gateway (requires the "live" module to be installed)',
    )
    .option(
      '--stream',
      'also generate a stream controller (requires the "stream" module to be installed)',
    )
    .action(
      (
        name: string,
        options: {
          force?: boolean;
          graphql?: boolean;
          mcp?: boolean;
          live?: boolean;
          stream?: boolean;
        },
      ) => {
        const root = process.cwd();
        const blueprintPath = resolveBlueprintPath(root, name);

        if (!existsSync(blueprintPath)) {
          console.error(
            pc.red(
              `No blueprint found at ${blueprintPath}. Run "hery create:blueprint ${name}" first.`,
            ),
          );
          process.exitCode = 1;
          return;
        }

        const blueprint = loadBlueprint(blueprintPath);

        if (!blueprint.routed) {
          console.error(
            pc.red(
              `${name} is declared routed: false. It exists to be pointed at from another blueprint's includes/aggregates, not to be generated on its own.`,
            ),
          );
          process.exitCode = 1;
          return;
        }

        const ctx = buildResourceContext(blueprint);
        const targetDir = path.join(root, 'src', 'functional', ctx.kebabName);

        if (existsSync(targetDir) && !options.force) {
          console.error(
            pc.red(`${targetDir} already exists. Pass --force to overwrite.`),
          );
          process.exitCode = 1;
          return;
        }

        mkdirSync(targetDir, { recursive: true });

        const files: Record<string, string> = {
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

        if (options.graphql) {
          files[`${ctx.kebabName}.resolver.ts`] = resolverFile(ctx);
        }

        if (options.mcp) {
          files[`${ctx.kebabName}.mcp-tools.ts`] = mcpToolsFile(ctx);
        }

        if (options.live) {
          files[`${ctx.kebabName}.live.gateway.ts`] = liveGatewayFile(ctx);
        }

        if (options.stream) {
          files[`${ctx.kebabName}.stream.controller.ts`] =
            streamControllerFile(ctx);
        }

        for (const [fileName, content] of Object.entries(files)) {
          writeFileSync(path.join(targetDir, fileName), content);
          console.log(pc.green(`✔ ${path.join(targetDir, fileName)}`));
        }

        const schemaPath = path.join(root, 'prisma', 'schema.prisma');
        const prismaClientPath = path.join(
          root,
          'src',
          'technical',
          'prisma',
          'prisma.client.ts',
        );

        const auditLogPath = path.join(
          root,
          'src',
          'technical',
          'audit',
          'audit-log.ts',
        );

        const schemaPatched = patchPrismaSchema(schemaPath, ctx);
        patchModelSet(prismaClientPath, 'TENANT_SCOPED_MODELS', ctx.pascalName);
        patchModelSet(auditLogPath, 'AUDITED_MODELS', ctx.pascalName);
        console.log(
          schemaPatched
            ? pc.green(`✔ patched ${schemaPath}`)
            : pc.dim(
                `model ${ctx.pascalName} already in ${schemaPath}, schema left untouched`,
              ),
        );
        console.log(pc.green(`✔ patched ${prismaClientPath}`));
        console.log(pc.green(`✔ patched ${auditLogPath}`));

        console.log('');
        console.log(pc.bold(`Generated ${ctx.pascalName} in ${targetDir}`));
        console.log(pc.cyan('Next steps:'));
        console.log(
          `  1. Import ${pc.bold(`${ctx.pascalName}Module`)} into src/app.module.ts`,
        );
        console.log(
          `  2. Run "pnpm hery migrate --name add_${ctx.kebabName}" to create the migration`,
        );

        if (options.graphql) {
          console.log(
            `  3. Add ${pc.bold(`${ctx.pascalName}Resolver`)} to the providers of ${ctx.kebabName}.module.ts`,
          );
        }

        if (options.mcp) {
          console.log(
            `  3. Add ${pc.bold(`${ctx.pascalName}McpToolRegistrar`)} as an exported provider of ${ctx.kebabName}.module.ts, then list it in ${pc.bold('McpGatewayModule.forRoot({ imports, registrars })')} in src/app.module.ts`,
          );
        }

        if (options.live) {
          console.log(
            `  3. Import ${pc.bold('LiveModule')} and add ${pc.bold(`${ctx.pascalName}LiveGateway`)} to the imports/providers of ${ctx.kebabName}.module.ts`,
          );
        }

        if (options.stream) {
          console.log(
            `  3. Import ${pc.bold('StreamModule')} and add ${pc.bold(`${ctx.pascalName}StreamController`)} to the imports/controllers of ${ctx.kebabName}.module.ts`,
          );
        }
      },
    );
}
