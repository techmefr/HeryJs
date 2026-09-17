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
import { SMS_MODULE } from '#kernel/sms/sms-driver';
import type { SmsDriver } from '#kernel/sms/sms-driver';
import { LogSmsDriver } from './log-sms.driver';

const BUILTIN_DRIVER = 'log';

// `sms` is still pending on HeryConfig, which this module does not own.
function smsSlice(config: HeryConfig): HeryConfigDrivers | undefined {
  return (config as { sms?: HeryConfigDrivers }).sms;
}

/**
 * Single active driver, like mail: a caller says "send this", never "send this
 * through Twilio". Every declared driver still resolves at boot, so a project
 * running on `log` in development finds a missing provider package on its own
 * machine rather than the first time production starts.
 */
@Injectable()
export class SmsDriverRegistry implements OnModuleInit {
  private readonly drivers = new Map<string, SmsDriver>();

  constructor(
    @Inject(HERY_CONFIG) private readonly config: HeryConfig,
    private readonly logDriver: LogSmsDriver,
    private readonly resolver: DriverResolver,
  ) {}

  onModuleInit(): void {
    const declared = smsSlice(this.config)?.drivers ?? {
      [BUILTIN_DRIVER]: { driver: BUILTIN_DRIVER },
    };

    for (const [keyword, entry] of Object.entries(declared)) {
      if (entry.driver === BUILTIN_DRIVER) {
        this.drivers.set(keyword, this.logDriver);
        continue;
      }

      const driver = this.resolver.find<SmsDriver>(SMS_MODULE, entry.driver);

      if (!driver) {
        throw new Error(
          missingDriverMessage(SMS_MODULE, keyword, entry.driver),
        );
      }

      this.drivers.set(keyword, driver);
    }

    const active = smsSlice(this.config)?.default ?? BUILTIN_DRIVER;

    if (!this.drivers.has(active)) {
      throw new Error(
        `hery.config.ts sets sms.default to "${active}", which is not declared in sms.drivers (${[...this.drivers.keys()].join(', ')}).`,
      );
    }
  }

  get active(): SmsDriver {
    const keyword = smsSlice(this.config)?.default ?? BUILTIN_DRIVER;
    const driver = this.drivers.get(keyword);

    if (!driver) {
      throw new Error(`SMS driver "${keyword}" was never resolved.`);
    }

    return driver;
  }
}
