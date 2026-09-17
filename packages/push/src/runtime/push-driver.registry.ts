import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { HERY_CONFIG } from '#kernel/config/hery-config';
import type {
  HeryConfig,
  HeryConfigDrivers,
} from '#kernel/config/hery-config.types';
import {
  DriverResolver,
  missingDriverMessage,
} from '#kernel/drivers/driver-resolver';
import { PUSH_MODULE } from '#kernel/push/push-driver';
import type { PushDriver } from '#kernel/push/push-driver';
import { LogPushDriver } from './log-push.driver';

const BUILTIN_DRIVER = 'log';

// `push` is still pending on HeryConfig, which this module does not own.
function pushSlice(config: HeryConfig): HeryConfigDrivers | undefined {
  return (config as { push?: HeryConfigDrivers }).push;
}

@Injectable()
export class PushDriverRegistry implements OnModuleInit {
  private readonly drivers = new Map<string, PushDriver>();

  constructor(
    @Inject(HERY_CONFIG) private readonly config: HeryConfig,
    private readonly logDriver: LogPushDriver,
    private readonly resolver: DriverResolver,
  ) {}

  onModuleInit(): void {
    const declared = pushSlice(this.config)?.drivers ?? {
      [BUILTIN_DRIVER]: { driver: BUILTIN_DRIVER },
    };

    for (const [keyword, entry] of Object.entries(declared)) {
      if (entry.driver === BUILTIN_DRIVER) {
        this.drivers.set(keyword, this.logDriver);
        continue;
      }

      const driver = this.resolver.find<PushDriver>(PUSH_MODULE, entry.driver);

      if (!driver) {
        throw new Error(
          missingDriverMessage(PUSH_MODULE, keyword, entry.driver),
        );
      }

      this.drivers.set(keyword, driver);
    }

    const active = pushSlice(this.config)?.default ?? BUILTIN_DRIVER;

    if (!this.drivers.has(active)) {
      throw new Error(
        `hery.config.ts sets push.default to "${active}", which is not declared in push.drivers (${[...this.drivers.keys()].join(', ')}).`,
      );
    }
  }

  get active(): PushDriver {
    const keyword = pushSlice(this.config)?.default ?? BUILTIN_DRIVER;
    const driver = this.drivers.get(keyword);

    if (!driver) {
      throw new Error(`Push driver "${keyword}" was never resolved.`);
    }

    return driver;
  }
}
