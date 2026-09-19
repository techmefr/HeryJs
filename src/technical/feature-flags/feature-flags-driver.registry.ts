import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { HERY_CONFIG } from '#technical/config/hery-config';
import type { HeryConfig } from '#technical/config/hery-config.types';
import {
  DriverResolver,
  missingDriverMessage,
} from '#technical/drivers/driver-resolver';
import {
  FEATURE_FLAGS_MODULE,
  type FeatureFlagDriver,
} from './feature-flags-driver';
import { LocalFeatureFlagsDriver } from './local-feature-flags.driver';

const BUILTIN_DRIVER = 'local';

/**
 * Single-active-driver, like mail and sms: a caller says "is this flag on",
 * never "check LaunchDarkly for this flag". Every declared driver still
 * resolves at boot, so a project running on `local` in development finds a
 * missing provider package on its own machine rather than the first time
 * production starts with FEATURE_FLAGS_DRIVER=launchdarkly.
 */
@Injectable()
export class FeatureFlagsDriverRegistry implements OnModuleInit {
  private readonly drivers = new Map<string, FeatureFlagDriver>();

  constructor(
    @Inject(HERY_CONFIG) private readonly config: HeryConfig,
    private readonly localDriver: LocalFeatureFlagsDriver,
    private readonly resolver: DriverResolver,
  ) {}

  onModuleInit(): void {
    const declared = this.config.featureFlags?.drivers ?? {
      [BUILTIN_DRIVER]: { driver: BUILTIN_DRIVER },
    };

    for (const [keyword, entry] of Object.entries(declared)) {
      if (entry.driver === BUILTIN_DRIVER) {
        this.drivers.set(keyword, this.localDriver);
        continue;
      }

      const driver = this.resolver.find<FeatureFlagDriver>(
        FEATURE_FLAGS_MODULE,
        entry.driver,
      );

      if (!driver) {
        throw new Error(
          missingDriverMessage(FEATURE_FLAGS_MODULE, keyword, entry.driver),
        );
      }

      this.drivers.set(keyword, driver);
    }

    const active = this.config.featureFlags?.default ?? BUILTIN_DRIVER;

    // Checked here rather than left to the first lookup, because a default
    // naming an undeclared driver is the same class of mistake as a missing
    // package: a typo in one config line that would otherwise surface as a
    // runtime failure on whichever request first checked a flag.
    if (!this.drivers.has(active)) {
      throw new Error(
        `hery.config.ts sets featureFlags.default to "${active}", which is not declared in featureFlags.drivers (${[...this.drivers.keys()].join(', ')}).`,
      );
    }
  }

  get active(): FeatureFlagDriver {
    const keyword = this.config.featureFlags?.default ?? BUILTIN_DRIVER;
    const driver = this.drivers.get(keyword);

    if (!driver) {
      throw new Error(`Feature flags driver "${keyword}" was never resolved.`);
    }

    return driver;
  }
}
