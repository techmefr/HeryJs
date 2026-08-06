import { NestFactory } from '@nestjs/core';
import type { Command } from 'commander';
import pc from 'picocolors';
import type { ExposedFieldSpec } from '#technical/exposition/exposition.types';

function describeSpec(spec: ExposedFieldSpec): string {
  switch (spec.kind) {
    case 'number':
      return `number, ${spec.min}..${spec.max}${spec.step ? ` step ${spec.step}` : ''}, default ${spec.default}`;
    case 'boolean':
      return `boolean, default ${spec.default}`;
    case 'string':
      return `string, max ${spec.maxLength} chars, default "${spec.default}"`;
    case 'enum':
      return `one of ${spec.values.join('|')}, default ${spec.default}`;
  }
}

export function registerExposeListCommand(program: Command): void {
  program
    .command('expose:list')
    .description(
      'List every action exposed to the mine, with its capability, environment filter and params',
    )
    .action(async () => {
      const { AppModule } = await import('#app.module');
      const { ExpositionRegistry } =
        await import('#technical/exposition/exposition.registry');

      const app = await NestFactory.createApplicationContext(AppModule, {
        logger: false,
      });

      const registry = app.get(ExpositionRegistry, { strict: false });
      const actions = registry.all();

      if (actions.length === 0) {
        console.log(pc.yellow('nothing exposed yet'));
      } else {
        for (const action of actions) {
          const environments = action.environments
            ? pc.dim(` (${action.environments.join(', ')} only)`)
            : '';
          console.log(
            `${pc.bold(action.name)} ${pc.dim(`[${action.capability.name || 'anonymous'}]`)}${environments}`,
          );
          for (const param of action.params) {
            console.log(
              `  ${pc.dim('-')} ${param.name}: ${describeSpec(param.spec)}`,
            );
          }
        }
      }

      await app.close();
    });
}
