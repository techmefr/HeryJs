import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  HERY_CONFIG,
  type HeryConfig,
  type HeryConfigDrivers,
} from '@heryjs/core/config';
import {
  DriverResolver,
  missingDriverMessage,
  STORAGE_MODULE,
  type StorageDriver,
} from '@heryjs/core/drivers';
import { LocalStorageDriver } from './local-storage.driver';
import { storageEnv } from './storage.env';

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
 * With no `storage` slice declared, STORAGE_DRIVER picks between the two
 * drivers this module carries, so `STORAGE_DRIVER=s3` alone is enough to store
 * in S3. A declared slice always wins: it is the committed statement of what
 * the app uses, and an environment variable does not get to contradict it.
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
      [this.activeKeyword()]: { driver: this.activeKeyword() },
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

  /**
   * What the admin shows an operator: which driver is active and which others
   * the config declares. Names only -- nothing here reads a credential.
   */
  get summary(): { active: string; declared: string[] } {
    return { active: this.activeKeyword(), declared: [...this.drivers.keys()] };
  }

  private slice(): HeryConfigDrivers | undefined {
    return this.config.storage;
  }

  private declared(): Record<string, { driver: string }> | undefined {
    return this.slice()?.drivers;
  }

  private activeKeyword(): string {
    return this.slice()?.default ?? storageEnv.STORAGE_DRIVER;
  }
}
