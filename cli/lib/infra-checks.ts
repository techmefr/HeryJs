import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { connect } from 'node:net';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Client } from 'pg';
import pc from 'picocolors';

export interface CheckResult {
  label: string;
  ok: boolean;
  hint?: string;
  /** Worth saying, not worth failing on: printed in yellow, exit code kept. */
  warning?: boolean;
}

/** Prints each check and answers whether the whole set passed. */
export function reportChecks(checks: CheckResult[]): boolean {
  for (const check of checks) {
    const icon = check.warning
      ? pc.yellow('!')
      : check.ok
        ? pc.green('✔')
        : pc.red('✘');
    const hint = check.hint ? pc.dim(` — ${check.hint}`) : '';
    console.log(`${icon} ${check.label}${hint}`);
  }

  return checks.every((check) => check.ok);
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

    function settle(answered: boolean) {
      clearTimeout(timer);
      socket.destroy();
      resolve(answered);
    }

    const timer = setTimeout(() => settle(false), timeoutMs);

    socket.once('connect', () => socket.write('PING\r\n'));
    socket.once('data', (chunk: Buffer) =>
      settle(chunk.toString('utf8').startsWith('+PONG')),
    );
    socket.once('error', () => settle(false));
  });
}

const POLL_INTERVAL_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A container that has just been started publishes its port before the service
 * behind it answers, so the check that runs straight after `--start` found a
 * socket that accepted the connection and a protocol that did not reply -- and
 * reported the one thing that could not be true there, a port belonging to
 * another service. Waiting is what tells "still starting" from "not this
 * service": given time, the first one answers.
 *
 * `waitMs` of zero polls once, which is what a plain `hery up` wants -- it
 * reports the state of the world now, it does not wait for it to improve.
 */
async function untilItAnswers(
  host: string,
  port: number,
  answers: () => Promise<boolean>,
  waitMs: number,
): Promise<{ reachable: boolean; answers: boolean }> {
  const deadline = Date.now() + waitMs;

  for (;;) {
    const reachable = await checkTcp(host, port);

    if (reachable && (await answers())) {
      return { reachable: true, answers: true };
    }

    if (Date.now() >= deadline) {
      return { reachable, answers: false };
    }

    await delay(POLL_INTERVAL_MS);
  }
}

/**
 * A fresh project has a schema and no migration yet: that is the step the
 * README gives next, not a broken environment, and failing `hery up --start`
 * over it made the documented first run exit 1.
 */
export function hasMigrations(root = process.cwd()): boolean {
  const dir = path.join(root, 'prisma', 'migrations');

  return (
    existsSync(dir) &&
    readdirSync(dir, { withFileTypes: true }).some(
      (entry) =>
        entry.isDirectory() &&
        existsSync(path.join(dir, entry.name, 'migration.sql')),
    )
  );
}

export function checkMigrations(): CheckResult {
  if (!hasMigrations()) {
    return {
      label: 'Prisma migrations',
      ok: true,
      warning: true,
      hint: 'none created yet — run "pnpm hery migrate --name init"',
    };
  }

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

/**
 * `CONFIG GET` over the inline protocol, like the PING above. Undefined when
 * the server will not say (a managed Valkey often renames CONFIG away).
 */
export function redisConfigValue(
  host: string,
  port: number,
  name: string,
  timeoutMs = 1000,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    let received = '';

    function settle(value: string | undefined) {
      clearTimeout(timer);
      socket.destroy();
      resolve(value);
    }

    const timer = setTimeout(() => settle(undefined), timeoutMs);

    socket.once('connect', () => socket.write(`CONFIG GET ${name}\r\n`));
    socket.on('data', (chunk: Buffer) => {
      received += chunk.toString('utf8');
      const lines = received.split('\r\n');

      if (lines[0] !== '*2') {
        settle(undefined);
      } else if (lines.length >= 5) {
        settle(lines[4]);
      }
    });
    socket.once('error', () => settle(undefined));
  });
}

/**
 * BullMQ keeps jobs, locks and the outbox relay in the same server as the
 * cache, and any eviction policy drops them as readily as a cache entry.
 */
export async function checkEvictionPolicy(
  redisUrl: string,
): Promise<CheckResult> {
  const label = 'Valkey maxmemory-policy';
  const parsed = parseHostPort(redisUrl, 6379);
  const policy = parsed
    ? await redisConfigValue(parsed.host, parsed.port, 'maxmemory-policy')
    : undefined;

  if (policy === undefined) {
    return {
      label,
      ok: true,
      warning: true,
      hint: 'could not read it; make sure it is noeviction, BullMQ jobs live in the same server',
    };
  }

  return policy === 'noeviction'
    ? { label: `${label} (noeviction)`, ok: true }
    : {
        label: `${label} (${policy})`,
        ok: false,
        hint: 'must be noeviction: any other policy can evict queued jobs — start Valkey with --maxmemory-policy noeviction',
      };
}

const REQUIRE_CALL = /\brequire\("([^"]+)"\)/g;

function compiledFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return compiledFiles(full);
    }

    return entry.name.endsWith('.js') ? [full] : [];
  });
}

function bareSpecifier(specifier: string): string | undefined {
  if (
    specifier.startsWith('.') ||
    specifier.startsWith('#') ||
    specifier.startsWith('node:') ||
    isBuiltin(specifier)
  ) {
    return undefined;
  }

  const parts = specifier.split('/');

  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/**
 * The build is what production runs, and a package that resolves while
 * developing only because something else pulls it in does not resolve there:
 * `node dist/src/main` died on `express` in every fresh project that way.
 */
export function checkBuildImports(root = process.cwd()): CheckResult {
  const label = 'Build imports';
  const dist = path.join(root, 'dist');

  if (!existsSync(dist)) {
    return {
      label,
      ok: true,
      warning: true,
      hint: 'no build yet — run "pnpm build" to have its imports checked',
    };
  }

  const missing = new Map<string, string>();

  for (const file of compiledFiles(dist)) {
    for (const match of readFileSync(file, 'utf8').matchAll(REQUIRE_CALL)) {
      const name = match[1] === undefined ? undefined : bareSpecifier(match[1]);

      if (name === undefined || missing.has(name)) {
        continue;
      }

      try {
        require.resolve(name, { paths: [root] });
      } catch {
        missing.set(name, path.relative(root, file));
      }
    }
  }

  if (missing.size === 0) {
    return { label, ok: true };
  }

  return {
    label,
    ok: false,
    hint: `${[...missing]
      .map(([name, file]) => `"${name}" (from ${file}) does not resolve`)
      .join('; ')} — declare it in the dependencies of package.json`,
  };
}

export async function runInfraChecks({
  waitMs = 0,
}: { waitMs?: number } = {}): Promise<CheckResult[]> {
  const databaseUrl = process.env.DATABASE_URL;
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6479';

  const checks: CheckResult[] = [];

  if (databaseUrl) {
    const parsed = parseHostPort(databaseUrl, 5432);

    if (parsed) {
      const { reachable, answers } = await untilItAnswers(
        parsed.host,
        parsed.port,
        () => speaksPostgres(databaseUrl),
        waitMs,
      );

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
    const { reachable: redisReachable, answers: redisAnswers } =
      await untilItAnswers(
        redisParsed.host,
        redisParsed.port,
        () => speaksRedis(redisParsed.host, redisParsed.port),
        waitMs,
      );

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
