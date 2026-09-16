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
import { LocalStorageDriver } from './local-storage.driver';
import { STORAGE_MODULE } from '#kernel/storage/storage-driver';
import type { StorageDriver } from '#kernel/storage/storage-driver';

const BUILTIN_DRIVER = 'local';

/**
 * Storage is a single-active-driver module: a caller says "store this", never
 * "store this in S3". So the registry exposes only `active`, and the choice
 * lives entirely in hery.config.ts.
 *
 * Every declared driver is still resolved at boot, not just the active one. A
 * project that declares S3 but runs on local disk in development should find
 * out that the S3 package is missing on its own machine, not the first time
 * production starts with STORAGE_DRIVER=s3.
 *
 * Resolution runs in onModuleInit rather than the constructor because driver
 * modules are global but outside this module's import graph, so the lookup
 * needs every provider already instantiated.
 */
@Injectable()
export class StorageDriverRegistry implements OnModuleInit {
  private readonly drivers = new Map<string, StorageDriver>();

  constructor(
    @Inject(HERY_CONFIG) private readonly config: HeryConfig,
    private readonly localDriver: LocalStorageDriver,
    private readonly resolver: DriverResolver,
  ) {}

  onModuleInit(): void {
    const declared = this.declared() ?? {
      [BUILTIN_DRIVER]: { driver: BUILTIN_DRIVER },
    };

    for (const [keyword, entry] of Object.entries(declared)) {
      if (entry.driver === BUILTIN_DRIVER) {
        this.drivers.set(keyword, this.localDriver);
        continue;
      }

      const driver = this.resolver.find<StorageDriver>(
        STORAGE_MODULE,
        entry.driver,
      );

      if (!driver) {
        throw new Error(
          missingDriverMessage(STORAGE_MODULE, keyword, entry.driver),
        );
      }

      this.drivers.set(keyword, driver);
    }

    const active = this.activeKeyword();

    // Checked here rather than left to the first upload, because a default
    // naming an undeclared driver is the same class of mistake as a missing
    // package: a typo in one config line that would otherwise surface as a
    // runtime failure on whichever request first tried to store a file.
    if (!this.drivers.has(active)) {
      throw new Error(
        `hery.config.ts sets storage.default to "${active}", which is not declared in storage.drivers (${[...this.drivers.keys()].join(', ')}).`,
      );
    }
  }

  get active(): StorageDriver {
    const keyword = this.activeKeyword();
    const driver = this.drivers.get(keyword);

    if (!driver) {
      throw new Error(`Storage driver "${keyword}" was never resolved.`);
    }

    return driver;
  }

  private slice(): HeryConfigDrivers | undefined {
    return this.config.storage;
  }

  private declared(): Record<string, { driver: string }> | undefined {
    return this.slice()?.drivers;
  }

  private activeKeyword(): string {
    return this.slice()?.default ?? BUILTIN_DRIVER;
  }
}
