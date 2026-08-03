import { connect } from 'node:net';
import { spawnSync } from 'node:child_process';

export interface CheckResult {
  label: string;
  ok: boolean;
  hint?: string;
}

export function parseHostPort(
  url: string,
  fallbackPort: number,
): { host: string; port: number } | null {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : fallbackPort,
    };
  } catch {
    return null;
  }
}

export function checkTcp(
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

export function checkMigrations(): CheckResult {
  const result = spawnSync('npx', ['prisma', 'migrate', 'status'], {
    encoding: 'utf-8',
    shell: process.platform === 'win32',
  });

  if (result.error || result.status === null) {
    return {
      label: 'Prisma migrations',
      ok: false,
      hint: 'could not run "npx prisma migrate status"',
    };
  }

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const upToDate = output.includes('Database schema is up to date');

  return {
    label: 'Prisma migrations',
    ok: upToDate,
    hint: upToDate ? undefined : 'run "pnpm hery migrate --name <name>"',
  };
}

export async function runInfraChecks(): Promise<CheckResult[]> {
  const databaseUrl = process.env.DATABASE_URL;
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6479';

  const checks: CheckResult[] = [];

  if (databaseUrl) {
    const parsed = parseHostPort(databaseUrl, 5432);

    if (parsed) {
      const reachable = await checkTcp(parsed.host, parsed.port);
      checks.push({
        label: `PostgreSQL (${parsed.host}:${parsed.port})`,
        ok: reachable,
        hint: reachable ? undefined : 'run "docker compose up -d postgres"',
      });
    } else {
      checks.push({
        label: 'PostgreSQL',
        ok: false,
        hint: 'DATABASE_URL is not a valid URL',
      });
    }
  } else {
    checks.push({
      label: 'PostgreSQL',
      ok: false,
      hint: 'DATABASE_URL is not set',
    });
  }

  const redisParsed = parseHostPort(redisUrl, 6379);

  if (redisParsed) {
    const redisReachable = await checkTcp(redisParsed.host, redisParsed.port);
    checks.push({
      label: `Valkey (${redisParsed.host}:${redisParsed.port})`,
      ok: redisReachable,
      hint: redisReachable ? undefined : 'run "docker compose up -d valkey"',
    });
  } else {
    checks.push({
      label: 'Valkey',
      ok: false,
      hint: 'REDIS_URL is not a valid URL',
    });
  }

  if (databaseUrl && checks[0]?.ok) {
    checks.push(checkMigrations());
  }

  return checks;
}
