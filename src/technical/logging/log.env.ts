import { z } from 'zod';
import { parseModuleEnv } from '#technical/config/module-env';

const MEGABYTE = 1024 * 1024;

let fileEnv: ReturnType<typeof readFileEnv> | null = null;
let httpEnv: ReturnType<typeof readHttpEnv> | null = null;

function readFileEnv() {
  return parseModuleEnv('log-file', {
    LOG_FILE_PATH: z.string().min(1).default('logs/app.log'),
    LOG_FILE_MAX_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(10 * MEGABYTE),
    LOG_FILE_MAX_FILES: z.coerce.number().int().positive().default(5),
  });
}

function readHttpEnv() {
  return parseModuleEnv('log-http', {
    LOG_HTTP_URL: z.url(),
    LOG_HTTP_TOKEN: z.string().min(1).optional(),
    LOG_HTTP_APP: z.string().min(1).default('heryjs'),
    LOG_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  });
}

/**
 * Read when the driver is declared, never when this file is imported: a
 * project that ships to stdout has no business being refused at boot for the
 * absence of a collector URL it never asked for.
 */
export function logFileEnv() {
  fileEnv ??= readFileEnv();

  return fileEnv;
}

export function logHttpEnv() {
  httpEnv ??= readHttpEnv();

  return httpEnv;
}
