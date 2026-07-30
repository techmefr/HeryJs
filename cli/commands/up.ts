import { connect } from 'node:net';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import { replaceUrlPort, upsertEnvVar } from '../lib/env-file';

interface CheckResult {
  label: string;
  ok: boolean;
  hint?: string;
}

const OPTIONAL_COMPOSE_SERVICES = [
  {
    composeFile: 'docker-compose.search-elasticsearch.yml',
    service: 'elasticsearch',
    containerPort: 9200,
    envVar: 'ELASTICSEARCH_URL',
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

function parseHostPort(url: string, fallbackPort: number) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : fallbackPort,
  };
}

function checkTcp(
  host: string,
  port: number,
  timeoutMs = 1000,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);

    socket.once('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });

    socket.once('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

function checkMigrations(): CheckResult {
  const result = spawnSync('npx', ['prisma', 'migrate', 'status'], {
    encoding: 'utf-8',
  });

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const upToDate = output.includes('Database schema is up to date');

  return {
    label: 'Prisma migrations',
    ok: upToDate,
    hint: upToDate ? undefined : 'run "pnpm hery migrate --name <name>"',
  };
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

      const databaseUrl = process.env.DATABASE_URL;
      const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6479';

      const checks: CheckResult[] = [];

      if (databaseUrl) {
        const { host, port } = parseHostPort(databaseUrl, 5432);
        const reachable = await checkTcp(host, port);
        checks.push({
          label: `PostgreSQL (${host}:${port})`,
          ok: reachable,
          hint: reachable ? undefined : 'run "docker compose up -d postgres"',
        });
      } else {
        checks.push({
          label: 'PostgreSQL',
          ok: false,
          hint: 'DATABASE_URL is not set',
        });
      }

      const { host: redisHost, port: redisPort } = parseHostPort(
        redisUrl,
        6379,
      );
      const redisReachable = await checkTcp(redisHost, redisPort);
      checks.push({
        label: `Valkey (${redisHost}:${redisPort})`,
        ok: redisReachable,
        hint: redisReachable ? undefined : 'run "docker compose up -d valkey"',
      });

      if (databaseUrl && checks[0]?.ok) {
        checks.push(checkMigrations());
      }

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
