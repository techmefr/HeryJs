import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import {
  jobFile,
  listenerFile,
  notificationFile,
  policyFile,
  scheduledTaskFile,
  seederFile,
  webhookHandlerFile,
} from '../lib/makeable-templates';
import {
  camelCase,
  kebabCase,
  kebabToPascalCase,
  screamingSnakeCase,
} from '../lib/naming';
import { printNextSteps } from '../lib/next-steps';
import type { MakeableFile } from './make-mail';

interface ConcernKind {
  command: string;
  description: string;
  /** Stripped from the name to derive the default domain, so `make:job SendDigestJob` lands in `send-digest`. */
  suffix: RegExp;
  fileSuffix?: string;
  render: (ctx: {
    pascalName: string;
    kebabName: string;
    camelName: string;
    screamingSnakeName: string;
  }) => string;
  nextSteps: (pascalName: string, fileName: string) => string[];
}

/**
 * Three concern types the kernel already runs and nothing scaffolded: a
 * queued job, an event listener, a scheduled task. Each existed only as a
 * hand-written example to copy, which is how a job ends up without a retry
 * policy and a task without a recorded run -- the parts a copy quietly drops
 * are exactly the ones that are invisible until they matter.
 */
export const CONCERN_KINDS: ConcernKind[] = [
  {
    command: 'job',
    description: 'Generate a queued job with its name and retry policy',
    suffix: /-?job$/,
    render: jobFile,
    nextSteps: (pascalName) => [
      `Give ${pascalName}Data the payload this job actually carries`,
      `Register ${pascalName}Processor in your resource's module`,
      `Dispatch it with JobsService.dispatch(<NAME>_JOB, data, <NAME>_POLICY)`,
    ],
  },
  {
    command: 'listener',
    description: 'Generate an event listener',
    suffix: /-?listener$/,
    render: listenerFile,
    nextSteps: (pascalName) => [
      'Replace the placeholder event class with the one this reacts to',
      `Subscribe it with EventDispatcher.listen(<Event>, new ${pascalName}Listener())`,
      'Set isQueued when the work is slow enough that the dispatching request should not wait for it',
    ],
  },
  {
    command: 'scheduled-task',
    description: 'Generate a scheduled task',
    suffix: /-?(scheduled-)?task$/,
    render: scheduledTaskFile,
    nextSteps: (pascalName) => [
      'Set the cron expression this should actually run on',
      `Register ${pascalName}Task in your resource's module`,
      'Its runs are recorded through ScheduledTaskStore, so a task that stops firing is visible rather than merely silent',
    ],
  },
  {
    command: 'policy',
    description: 'Generate a capability policy',
    suffix: /-?policy$/,
    fileSuffix: 'policy',
    render: policyFile,
    nextSteps: (pascalName) => [
      `Replace adminAbility with the rule can${pascalName} actually enforces`,
      `Guard a route with @Capability(can${pascalName})`,
    ],
  },
  {
    command: 'seeder',
    description: 'Generate a seeder exposed to the CLI and the mine',
    suffix: /-?seeder$/,
    fileSuffix: 'seeder',
    render: seederFile,
    nextSteps: (pascalName) => [
      `Write the rows ${pascalName}Seeder.run creates`,
      `Register ${pascalName}Seeder in your resource's module`,
      'Run it with "pnpm hery expose:run <name>.seed"',
    ],
  },
  {
    command: 'notification',
    description: 'Generate a notification rendered per channel',
    suffix: /-?notification$/,
    fileSuffix: 'notification',
    render: notificationFile,
    nextSteps: (pascalName) => [
      `Write what ${pascalName}Notification says on each channel, and delete the channels it has nothing to say on`,
      `Send it with NotifierService.send(recipient, new ${pascalName}Notification())`,
      'Run "pnpm hery install notifier" if the notifier module is not installed yet',
    ],
  },
  {
    command: 'webhook-handler',
    description: 'Generate a handler for one webhook source',
    suffix: /-?(webhook-)?handler$/,
    fileSuffix: 'webhook-handler',
    render: webhookHandlerFile,
    nextSteps: (pascalName) => [
      `Handle the payload in ${pascalName}WebhookHandler.handle -- it runs inside the event's tenant`,
      `Register ${pascalName}WebhookHandler in your resource's module`,
      'Create an endpoint with the same source name, and sign requests to it with its secret',
    ],
  },
];

/**
 * The kind's suffix is stripped before anything is derived from the name, so
 * `make:job SendDigestJob` and `make:job SendDigest` produce the same file.
 * Keeping it gave `SEND_DIGEST_JOB_JOB` and a `SendDigestJobProcessor`, which
 * is what happens when a name is used both as the thing and as its category.
 */
export function buildConcern(
  kind: ConcernKind,
  name: string,
  domain?: string,
): MakeableFile {
  const kebabName = kebabCase(name).replace(kind.suffix, '');
  const pascalName = kebabToPascalCase(kebabName);

  return {
    domain: domain ? kebabCase(domain) : kebabName,
    fileName: kind.fileSuffix
      ? `${kebabName}.${kind.fileSuffix}.ts`
      : `${kebabName}.ts`,
    source: kind.render({
      pascalName,
      kebabName,
      camelName: camelCase(pascalName),
      screamingSnakeName: screamingSnakeCase(pascalName),
    }),
    pascalName,
  };
}

export function registerMakeConcernCommands(program: Command): void {
  for (const kind of CONCERN_KINDS) {
    program
      .command(`make:${kind.command} <name>`)
      .description(`${kind.description} under src/functional/<domain>`)
      .option('-d, --domain <name>', 'Domain folder to write it into')
      .option('-f, --force', 'Overwrite an existing file')
      .action((name: string, options: { domain?: string; force?: boolean }) => {
        const concern = buildConcern(kind, name, options.domain);
        const targetDir = path.join(
          process.cwd(),
          'src',
          'functional',
          concern.domain,
        );
        const targetPath = path.join(targetDir, concern.fileName);

        if (existsSync(targetPath) && !options.force) {
          console.error(
            pc.red(`${targetPath} already exists. Pass --force to overwrite.`),
          );
          process.exitCode = 1;
          return;
        }

        mkdirSync(targetDir, { recursive: true });
        writeFileSync(targetPath, concern.source);
        console.log(pc.green(`✔ ${targetPath}`));

        printNextSteps(kind.nextSteps(concern.pascalName, concern.fileName));
      });
  }
}
