import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { HERY_CONFIG } from '#technical/config/hery-config';
import type { HeryConfig } from '#technical/config/hery-config.types';
import {
  DriverResolver,
  missingDriverMessage,
} from '#technical/drivers/driver-resolver';
import {
  ERROR_REPORTER_MODULE,
  type ErrorReporterDriver,
} from './error-reporter-driver';
import { NoopErrorReporterDriver } from './noop-error-reporter.driver';

const BUILTIN_DRIVER = 'noop';

@Injectable()
export class ErrorReporterDriverRegistry implements OnModuleInit {
  private readonly drivers = new Map<string, ErrorReporterDriver>();

  constructor(
    @Inject(HERY_CONFIG) private readonly config: HeryConfig,
    private readonly noopDriver: NoopErrorReporterDriver,
    private readonly resolver: DriverResolver,
  ) {}

  onModuleInit(): void {
    const declared = this.config.errorReporter?.drivers ?? {
      [BUILTIN_DRIVER]: { driver: BUILTIN_DRIVER },
    };

    for (const [keyword, entry] of Object.entries(declared)) {
      if (entry.driver === BUILTIN_DRIVER) {
        this.drivers.set(keyword, this.noopDriver);
        continue;
      }

      const driver = this.resolver.find<ErrorReporterDriver>(
        ERROR_REPORTER_MODULE,
        entry.driver,
      );

      if (!driver) {
        throw new Error(
          missingDriverMessage(ERROR_REPORTER_MODULE, keyword, entry.driver),
        );
      }

      this.drivers.set(keyword, driver);
    }

    const active = this.config.errorReporter?.default ?? BUILTIN_DRIVER;

    if (!this.drivers.has(active)) {
      throw new Error(
        `hery.config.ts sets errorReporter.default to "${active}", which is not declared in errorReporter.drivers (${[...this.drivers.keys()].join(', ')}).`,
      );
    }
  }

  get active(): ErrorReporterDriver {
    const keyword = this.config.errorReporter?.default ?? BUILTIN_DRIVER;
    const driver = this.drivers.get(keyword);

    if (!driver) {
      throw new Error(`Error reporter driver "${keyword}" was never resolved.`);
    }

    return driver;
  }
}
