import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import { replaceUrlPort, upsertEnvVar } from '../lib/env-file';
import { runInfraChecks } from '../lib/infra-checks';

const OPTIONAL_COMPOSE_SERVICES = [
  {
    composeFile: 'docker-compose.search-elasticsearch.yml',
    service: 'elasticsearch',
    containerPort: 9200,
    envVar: 'ELASTICSEARCH_URL',
  },
  {
    composeFile: 'docker-compose.search-meilisearch.yml',
    service: 'meilisearch',
    containerPort: 7700,
    envVar: 'MEILISEARCH_URL',
  },
];

function resolveComposePort(
  service: string,
  containerPort: number,
  composeFile?: string,
): number | undefined {
  const args = composeFile ? ['compose', '-f', composeFile] : ['compose'];
  const result = spawnSync(
    'docker',
    [...args, 'port', service, String(containerPort)],
    { encoding: 'utf-8' },
  );

  const port = result.stdout?.trim().split(':').pop();
  return port ? Number(port) : undefined;
}

function startOptionalComposeServices(envPath: string): void {
  for (const {
    composeFile,
    service,
    containerPort,
    envVar,
  } of OPTIONAL_COMPOSE_SERVICES) {
    if (!existsSync(composeFile)) {
      continue;
    }

    spawnSync('docker', ['compose', '-f', composeFile, 'up', '-d'], {
      stdio: 'inherit',
    });

    const port = resolveComposePort(service, containerPort, composeFile);

    if (port) {
      const url = `http://localhost:${port}`;
      process.env[envVar] = url;
      upsertEnvVar(envPath, envVar, url);
      console.log(pc.green(`✔ ${envVar} resolved to port ${port}`));
    }
  }
}

export function registerUpCommand(program: Command): void {
  program
    .command('up')
    .description(
      'Check that local dependencies (database, Redis, migrations) are ready',
    )
    .option(
      '--start',
      'start the docker compose services first and resolve their dynamically assigned ports into .env',
    )
    .action(async (options: { start?: boolean }) => {
      if (options.start) {
        console.log(pc.cyan('starting docker compose services...'));
        spawnSync('docker', ['compose', 'up', '-d', 'postgres', 'valkey'], {
          stdio: 'inherit',
        });

        const envPath = path.resolve(process.cwd(), '.env');
        const postgresPort = resolveComposePort('postgres', 5432);
        const valkeyPort = resolveComposePort('valkey', 6379);

        if (postgresPort && process.env.DATABASE_URL) {
          process.env.DATABASE_URL = replaceUrlPort(
            process.env.DATABASE_URL,
            postgresPort,
          );
          upsertEnvVar(envPath, 'DATABASE_URL', process.env.DATABASE_URL);
          console.log(
            pc.green(`✔ DATABASE_URL resolved to port ${postgresPort}`),
          );
        }

        if (valkeyPort && process.env.REDIS_URL) {
          process.env.REDIS_URL = replaceUrlPort(
            process.env.REDIS_URL,
            valkeyPort,
          );
          upsertEnvVar(envPath, 'REDIS_URL', process.env.REDIS_URL);
          console.log(pc.green(`✔ REDIS_URL resolved to port ${valkeyPort}`));
        }

        startOptionalComposeServices(envPath);
      }

      const checks = await runInfraChecks();

      let allOk = true;

      for (const check of checks) {
        const icon = check.ok ? pc.green('✔') : pc.red('✘');
        const hint = check.hint ? pc.dim(` — ${check.hint}`) : '';
        console.log(`${icon} ${check.label}${hint}`);
        allOk &&= check.ok;
      }

      process.exitCode = allOk ? 0 : 1;
    });
}
