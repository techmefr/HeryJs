import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

/**
 * The provider boundary lives here, not in the app: `env.ts` reads
 * process.env once, synchronously, at import time, and the whole kernel
 * depends on that as a plain value. Making it async or lazy to accommodate a
 * remote secrets manager would contaminate every technical/ module for a need
 * that only exists at startup. So any external manager -- Infisical, Doppler,
 * Vault, a company's own service -- plugs in here, at the CLI boundary, and
 * writes into `.env` like a developer would; the app never learns it exists.
 */
export interface EnvSource {
  name: string;
  load(): Promise<Record<string, string>>;
}

const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;

function unquote(value: string): string {
  const trimmed = value.trim();
  const quoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"));

  return quoted ? trimmed.slice(1, -1) : trimmed;
}

export function parseDotEnv(content: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }

    const match = ASSIGNMENT.exec(trimmed);

    if (match?.[1] !== undefined && match[2] !== undefined) {
      values[match[1]] = unquote(match[2]);
    }
  }

  return values;
}

export function dotEnvSource(repoRoot: string): EnvSource {
  const envPath = path.resolve(repoRoot, '.env');

  return {
    name: '.env',
    load() {
      return Promise.resolve(
        existsSync(envPath) ? parseDotEnv(readFileSync(envPath, 'utf8')) : {},
      );
    },
  };
}
