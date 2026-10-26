import { writeFileSync } from 'node:fs';
import * as path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import { discoverResourceContexts } from '../lib/openapi';
import { openApiClientFile } from '../lib/openapi-client';

export function registerOpenApiClientCommand(program: Command): void {
  program
    .command('openapi:client')
    .description(
      'Emits a typed TypeScript client generated from the same blueprint data as hery openapi',
    )
    .option(
      '-b, --blueprints <dir>',
      'Directory holding the blueprints',
      'blueprints',
    )
    .option('-o, --out <file>', 'Write to a file instead of stdout')
    .action((options: { blueprints: string; out?: string }) => {
      const contexts = discoverResourceContexts(
        path.resolve(process.cwd(), options.blueprints),
      );

      if (contexts.length === 0) {
        console.error(
          pc.yellow(
            'no routed blueprints found in the blueprints directory, nothing to generate',
          ),
        );
        process.exitCode = 1;
        return;
      }

      const code = openApiClientFile(contexts);

      if (!options.out) {
        process.stdout.write(code);
        return;
      }

      writeFileSync(options.out, code);
      console.log(pc.green(`wrote ${options.out}`));
    });
}
