import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { HERY_CONFIG } from '#technical/config/hery-config';
import type { HeryConfig } from '#technical/config/hery-config.types';
import {
  DriverResolver,
  missingDriverMessage,
} from '#technical/drivers/driver-resolver';
import { PUSH_MODULE } from '#technical/push/push-driver';
import type { PushDriver } from '#technical/push/push-driver';
import { LogPushDriver } from './log-push.driver';

const BUILTIN_DRIVER = 'log';

@Injectable()
export class PushDriverRegistry implements OnModuleInit {
  private readonly drivers = new Map<string, PushDriver>();

  constructor(
    @Inject(HERY_CONFIG) private readonly config: HeryConfig,
    private readonly logDriver: LogPushDriver,
    private readonly resolver: DriverResolver,
  ) {}

  onModuleInit(): void {
    const declared = this.config.push?.drivers ?? {
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

    const active = this.config.push?.default ?? BUILTIN_DRIVER;

    if (!this.drivers.has(active)) {
      throw new Error(
        `hery.config.ts sets push.default to "${active}", which is not declared in push.drivers (${[...this.drivers.keys()].join(', ')}).`,
      );
    }
  }

  get active(): PushDriver {
    const keyword = this.config.push?.default ?? BUILTIN_DRIVER;
    const driver = this.drivers.get(keyword);

    if (!driver) {
      throw new Error(`Push driver "${keyword}" was never resolved.`);
    }

    return driver;
  }
}
