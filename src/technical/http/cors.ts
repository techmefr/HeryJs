import { existsSync } from 'node:fs';
import * as path from 'node:path';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import type { CorsConfig } from './cors.types';

const CONFIG_FILENAME = 'cors.config.ts';
const ANY_ORIGIN = '*';

export const DEFAULT_CORS_METHODS = [
  'GET',
  'HEAD',
  'POST',
  'PATCH',
  'PUT',
  'DELETE',
  'OPTIONS',
];

// Authorization is the one a caller cannot do without: this framework
// authenticates with a Bearer token, and a preflight that does not allow the
// header refuses every authenticated cross-origin request.
export const DEFAULT_CORS_ALLOWED_HEADERS = ['Authorization', 'Content-Type'];

const DEFAULT_MAX_AGE_SECONDS = 24 * 60 * 60;

let tsNodeRegistered = false;

function ensureTsNodeRegistered(): void {
  if (tsNodeRegistered) {
    return;
  }

  // Registering a require hook is a CommonJS-only operation, the same reason
  // hery-config.ts does this: the file lives at the project root, outside src/,
  // so nothing else has transpiled it by the time it is asked for.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('ts-node/register/transpile-only');
  tsNodeRegistered = true;
}

/**
 * Absent file means no cross-origin access, which is the safe reading of "no
 * declaration" -- and the caller says so out loud rather than starting with CORS
 * quietly off.
 */
export function loadCorsConfig(): CorsConfig | null {
  const configPath = path.resolve(process.cwd(), CONFIG_FILENAME);

  if (!existsSync(configPath)) {
    return null;
  }

  ensureTsNodeRegistered();
  delete require.cache[configPath];

  // The path is only known at runtime (process.cwd()), so this cannot be a
  // static import.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const loaded = require(configPath) as { default?: CorsConfig } & CorsConfig;

  return loaded.default ?? loaded;
}

/**
 * CORS_ORIGINS replaces the file's origins when it is set, so a deployment
 * names its own front ends without editing a file baked into the image. Set
 * to an empty value, it turns CORS off the same way an empty list does.
 */
export function withOriginsFromEnv(
  config: CorsConfig | null,
  origins: readonly string[] | undefined,
): CorsConfig | null {
  if (origins === undefined) {
    return config;
  }

  return { ...config, origins };
}

/**
 * Turns the declaration into what Nest needs, or `false` for "send no CORS
 * header at all". Two combinations are refused outright rather than shipped:
 * `'*'` in production, which is the value that is convenient locally and wrong
 * once anything real is behind it, and `'*'` with credentials, which every
 * browser rejects -- so sending it produces an application that simply does not
 * work, with nothing in the server logs to say why.
 */
export function resolveCorsOptions(
  config: CorsConfig | null,
  nodeEnv: string | undefined,
): CorsOptions | false {
  if (!config || config.origins.length === 0) {
    return false;
  }

  const anyOrigin = config.origins.includes(ANY_ORIGIN);

  if (anyOrigin && nodeEnv === 'production') {
    throw new Error(
      `${CONFIG_FILENAME} allows any origin ("${ANY_ORIGIN}"), which is refused under NODE_ENV=production. Set CORS_ORIGINS to the origins that may call this API (comma-separated), or list them in ${CONFIG_FILENAME}; an empty list sends no CORS header at all.`,
    );
  }

  if (anyOrigin && config.credentials === true) {
    throw new Error(
      `${CONFIG_FILENAME} allows any origin ("${ANY_ORIGIN}") together with credentials, a combination every browser rejects. Name the origins explicitly, or turn credentials off.`,
    );
  }

  return {
    origin: anyOrigin ? ANY_ORIGIN : [...config.origins],
    methods: [...(config.methods ?? DEFAULT_CORS_METHODS)],
    allowedHeaders: [
      ...(config.allowedHeaders ?? DEFAULT_CORS_ALLOWED_HEADERS),
    ],
    exposedHeaders: [...(config.exposedHeaders ?? [])],
    credentials: config.credentials ?? false,
    maxAge: config.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS,
  };
}
