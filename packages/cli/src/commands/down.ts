import { randomBytes } from 'node:crypto';
import type { Command } from 'commander';
import pc from 'picocolors';
import {
  DEFAULT_RETRY_AFTER_SECONDS,
  MAINTENANCE_BYPASS_HEADER,
  hashMaintenanceSecret,
} from '@heryjs/core/technical/maintenance/maintenance-state';
import { MaintenanceStore } from '@heryjs/core/technical/maintenance/maintenance-store';

const DEFAULT_REDIS_URL = 'redis://localhost:6479';
const GENERATED_SECRET_BYTES = 16;

interface DownOptions {
  secret?: string | boolean;
  retry: string;
  message?: string;
}

function resolveSecret(option: string | boolean | undefined): string | null {
  if (option === undefined || option === false) {
    return null;
  }

  return typeof option === 'string'
    ? option
    : randomBytes(GENERATED_SECRET_BYTES).toString('hex');
}

function parseRetry(value: string): number | null {
  const seconds = Number(value);
  return Number.isInteger(seconds) && seconds > 0 ? seconds : null;
}

export function openMaintenanceStore(): MaintenanceStore {
  return new MaintenanceStore(process.env.REDIS_URL ?? DEFAULT_REDIS_URL);
}

export function registerDownCommand(program: Command): void {
  program
    .command('down')
    .description(
      'Put the application in maintenance mode: every request answers 503 with Retry-After until "hery up --lift"',
    )
    .option(
      '--secret [secret]',
      'let requests carrying this secret through; omit the value to generate one',
    )
    .option(
      '--retry <seconds>',
      'the Retry-After the 503 carries',
      String(DEFAULT_RETRY_AFTER_SECONDS),
    )
    .option('--message <text>', 'the message the 503 carries')
    .action(async (options: DownOptions) => {
      const retryAfterSeconds = parseRetry(options.retry);

      if (retryAfterSeconds === null) {
        console.error(
          pc.red('--retry takes a whole number of seconds above zero'),
        );
        process.exitCode = 1;
        return;
      }

      const secret = resolveSecret(options.secret);
      const store = openMaintenanceStore();

      try {
        await store.enable({
          secretHash: secret === null ? null : hashMaintenanceSecret(secret),
          retryAfterSeconds,
          message: options.message ?? null,
          startedAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error(
          pc.red(
            `could not reach Redis to start maintenance mode: ${(error as Error).message}`,
          ),
        );
        process.exitCode = 1;
        return;
      } finally {
        store.close();
      }

      console.log(pc.yellow('maintenance mode is on'));

      if (secret !== null) {
        console.log(
          `bypass with the header ${MAINTENANCE_BYPASS_HEADER}: ${secret}`,
        );
      }

      console.log(pc.dim('lift it with "pnpm hery up --lift"'));
    });
}
