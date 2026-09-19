import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { HERY_CONFIG } from '#technical/config/hery-config';
import type { HeryConfig } from '#technical/config/hery-config.types';
import {
  DriverResolver,
  missingDriverMessage,
} from '#technical/drivers/driver-resolver';
import { BILLING_MODULE } from '#technical/billing/billing-driver';
import type { BillingDriver } from '#technical/billing/billing-driver';
import { LogBillingDriver } from './log-billing.driver';

const BUILTIN_DRIVER = 'log';

/**
 * Single active driver, like mail: one webhook route, one provider verifying
 * it. Every declared driver still resolves at boot, the same reasoning as
 * everywhere else -- a misconfigured provider is a startup failure, not a
 * webhook silently failing its first real delivery.
 */
@Injectable()
export class BillingDriverRegistry implements OnModuleInit {
  private readonly drivers = new Map<string, BillingDriver>();

  constructor(
    @Inject(HERY_CONFIG) private readonly config: HeryConfig,
    private readonly logDriver: LogBillingDriver,
    private readonly resolver: DriverResolver,
  ) {}

  onModuleInit(): void {
    const declared = this.config.billing?.drivers ?? {
      [BUILTIN_DRIVER]: { driver: BUILTIN_DRIVER },
    };

    for (const [keyword, entry] of Object.entries(declared)) {
      if (entry.driver === BUILTIN_DRIVER) {
        this.drivers.set(keyword, this.logDriver);
        continue;
      }

      const driver = this.resolver.find<BillingDriver>(
        BILLING_MODULE,
        entry.driver,
      );

      if (!driver) {
        throw new Error(
          missingDriverMessage(BILLING_MODULE, keyword, entry.driver),
        );
      }

      this.drivers.set(keyword, driver);
    }

    const active = this.config.billing?.default ?? BUILTIN_DRIVER;

    if (!this.drivers.has(active)) {
      throw new Error(
        `hery.config.ts sets billing.default to "${active}", which is not declared in billing.drivers (${[...this.drivers.keys()].join(', ')}).`,
      );
    }
  }

  get active(): BillingDriver {
    const keyword = this.config.billing?.default ?? BUILTIN_DRIVER;
    const driver = this.drivers.get(keyword);

    if (!driver) {
      throw new Error(`Billing driver "${keyword}" was never resolved.`);
    }

    return driver;
  }
}
