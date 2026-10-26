import { writeFileSync } from 'node:fs';
import * as path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import { buildOpenApiDocument, discoverResourceContexts } from '../lib/openapi';

export function registerOpenApiCommand(program: Command): void {
  program
    .command('openapi')
    .description(
      "Emits an OpenAPI 3.1 document assembled from every routed resource's blueprint",
    )
    .option(
      '-b, --blueprints <dir>',
      'Directory holding the blueprints',
      'blueprints',
    )
    .option('-o, --out <file>', 'Write to a file instead of stdout')
    .option('--title <title>', 'Document title')
    .option('--api-version <version>', 'Document version')
    .action(
      (options: {
        blueprints: string;
        out?: string;
        title?: string;
        apiVersion?: string;
      }) => {
        const contexts = discoverResourceContexts(
          path.resolve(process.cwd(), options.blueprints),
        );

        if (contexts.length === 0) {
          console.error(
            pc.yellow(
              'no routed blueprints found in the blueprints directory, nothing to describe',
            ),
          );
          process.exitCode = 1;
          return;
        }

        const document = buildOpenApiDocument(contexts, {
          title: options.title,
          version: options.apiVersion,
        });
        const json = `${JSON.stringify(document, null, 2)}\n`;

        if (!options.out) {
          process.stdout.write(json);
          return;
        }

        writeFileSync(options.out, json);
        console.log(pc.green(`wrote ${options.out}`));
      },
    );
}
