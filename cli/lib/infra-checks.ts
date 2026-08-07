import { connect } from 'node:net';
import { spawnSync } from 'node:child_process';
import { Client } from 'pg';

export interface CheckResult {
  label: string;
  ok: boolean;
  hint?: string;
}

/**
 * Docker hands out a different port every time these containers are recreated,
 * and .env keeps the one from last time -- so the two URLs end up pointing at
 * each other's service, and a check that only opens a socket reports both of
 * them healthy. Every check here speaks the protocol it claims to be checking,
 * and separates "nothing is listening" from "something is, but it is not this".
 */
const NOT_THE_RIGHT_SERVICE =
  'something is listening there, but it does not answer as';

const RESYNC_HINT =
  'was the container recreated on a new port? run "pnpm hery up --start"';

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

export async function speaksPostgres(
  url: string,
  timeoutMs = 2000,
): Promise<boolean> {
  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: timeoutMs,
  });

  try {
    await client.connect();
    await client.query('select 1');
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

/**
 * RESP accepts an inline command, so a PING costs one write and needs no client
 * library: anything that answers `+PONG` is a Redis-compatible server, anything
 * else -- a Postgres listener included -- is not.
 */
export function speaksRedis(
  host: string,
  port: number,
  timeoutMs = 1000,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    let timer: NodeJS.Timeout;

    const settle = (answered: boolean) => {
      clearTimeout(timer);
      socket.destroy();
      resolve(answered);
    };

    timer = setTimeout(() => settle(false), timeoutMs);

    socket.once('connect', () => socket.write('PING\r\n'));
    socket.once('data', (chunk: Buffer) =>
      settle(chunk.toString('utf8').startsWith('+PONG')),
    );
    socket.once('error', () => settle(false));
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
      const answers = reachable && (await speaksPostgres(databaseUrl));

      checks.push({
        label: `PostgreSQL (${parsed.host}:${parsed.port})`,
        ok: answers,
        hint: answers
          ? undefined
          : reachable
            ? `${NOT_THE_RIGHT_SERVICE} PostgreSQL — ${RESYNC_HINT}`
            : 'run "docker compose up -d postgres"',
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
    const redisAnswers =
      redisReachable && (await speaksRedis(redisParsed.host, redisParsed.port));

    checks.push({
      label: `Valkey (${redisParsed.host}:${redisParsed.port})`,
      ok: redisAnswers,
      hint: redisAnswers
        ? undefined
        : redisReachable
          ? `${NOT_THE_RIGHT_SERVICE} Valkey — ${RESYNC_HINT}`
          : 'run "docker compose up -d valkey"',
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
