import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { HERY_CONFIG } from '#technical/config/hery-config';
import type { HeryConfig } from '#technical/config/hery-config.types';
import {
  DriverResolver,
  missingDriverMessage,
} from '#technical/drivers/driver-resolver';
import { DatabaseLogDriver } from './database-log.driver';
import { FileLogDriver } from './file-log.driver';
import { HttpLogDriver } from './http-log.driver';
import { logFileEnv, logHttpEnv } from './log.env';
import { LOG_MODULE, isQueryableLogDriver } from './log-driver';
import type { LogDriver, QueryableLogDriver } from './log-driver';
import { logPipeline } from './log.pipeline';
import { shouldPrettyPrint, StdoutLogDriver } from './stdout-log.driver';

const BUILTIN_DEFAULT = 'stdout';

/**
 * Every declared driver is active, so resolution builds them all and hands the
 * whole set to the pipeline. A declared driver that cannot be built stops the
 * boot: a project that asked for a collector and quietly got the console would
 * look healthy until somebody went looking for the logs.
 */
@Injectable()
export class LogDriverRegistry implements OnModuleInit, OnModuleDestroy {
  private readonly drivers = new Map<string, LogDriver>();

  constructor(
    @Inject(HERY_CONFIG) private readonly config: HeryConfig,
    private readonly database: DatabaseLogDriver,
    private readonly resolver: DriverResolver,
  ) {}

  onModuleInit(): void {
    const declared = this.config.logging?.drivers ?? {
      [BUILTIN_DEFAULT]: { driver: BUILTIN_DEFAULT },
    };

    for (const [keyword, entry] of Object.entries(declared)) {
      this.drivers.set(keyword, this.build(keyword, entry.driver));
    }

    const preferred = this.config.logging?.default ?? BUILTIN_DEFAULT;

    if (!this.drivers.has(preferred)) {
      throw new Error(
        `hery.config.ts sets logging.default to "${preferred}", which is not declared in logging.drivers (${[...this.drivers.keys()].join(', ')}).`,
      );
    }

    logPipeline.attach([...this.drivers.values()]);
  }

  async onModuleDestroy(): Promise<void> {
    await logPipeline.detach();
  }

  get reader(): QueryableLogDriver | null {
    const preferred = this.drivers.get(
      this.config.logging?.default ?? BUILTIN_DEFAULT,
    );

    if (preferred && isQueryableLogDriver(preferred)) {
      return preferred;
    }

    return [...this.drivers.values()].find(isQueryableLogDriver) ?? null;
  }

  get store(): DatabaseLogDriver | null {
    return (
      [...this.drivers.values()].find(
        (driver): driver is DatabaseLogDriver =>
          driver instanceof DatabaseLogDriver,
      ) ?? null
    );
  }

  private build(keyword: string, driver: string): LogDriver {
    switch (driver) {
      case 'stdout':
        return new StdoutLogDriver({
          isPretty: shouldPrettyPrint(process.env.NODE_ENV),
        });
      case 'file': {
        const env = logFileEnv();

        return new FileLogDriver({
          path: env.LOG_FILE_PATH,
          maxBytes: env.LOG_FILE_MAX_BYTES,
          maxFiles: env.LOG_FILE_MAX_FILES,
        });
      }
      case 'http': {
        const env = logHttpEnv();

        return new HttpLogDriver({
          url: env.LOG_HTTP_URL,
          token: env.LOG_HTTP_TOKEN ?? null,
          app: env.LOG_HTTP_APP,
          timeoutMs: env.LOG_HTTP_TIMEOUT_MS,
        });
      }
      case 'database':
        return this.database;
      default: {
        const external = this.resolver.find<LogDriver>(LOG_MODULE, driver);

        if (!external) {
          throw new Error(missingDriverMessage(LOG_MODULE, keyword, driver));
        }

        return external;
      }
    }
  }
}
