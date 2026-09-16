import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { HERY_CONFIG } from '#kernel/config/hery-config';
import type { HeryConfig } from '#kernel/config/hery-config.types';
import {
  DriverResolver,
  missingDriverMessage,
} from '#kernel/drivers/driver-resolver';
import { IMPORT_MODULE } from '#kernel/import/import-driver';
import type { ImportDriver } from '#kernel/import/import-driver';
import { InvalidQueryException } from '#kernel/errors/invalid-query.exception';
import { CsvImportDriver } from './csv-import.driver';

const BUILTIN_DRIVER = 'csv';

/**
 * Import is per-call for the same reason export is, from the other end: the
 * format is a property of the file the user just uploaded, not of the
 * deployment. Every declared driver stays resolved and usable at once, and
 * `default` only says which one `from()` means when it is given nothing.
 *
 * Resolution, the boot-time failure and the built-in driver work identically
 * to export's registry, which is the point of having one convention rather
 * than two.
 */
@Injectable()
export class ImportDriverRegistry implements OnModuleInit {
  private readonly drivers = new Map<string, ImportDriver>();

  constructor(
    @Inject(HERY_CONFIG) private readonly config: HeryConfig,
    private readonly csvDriver: CsvImportDriver,
    private readonly resolver: DriverResolver,
  ) {}

  onModuleInit(): void {
    const declared = this.config.import?.drivers ?? {
      [BUILTIN_DRIVER]: { driver: BUILTIN_DRIVER },
    };

    for (const [keyword, entry] of Object.entries(declared)) {
      if (entry.driver === BUILTIN_DRIVER) {
        this.drivers.set(keyword, this.csvDriver);
        continue;
      }

      const driver = this.resolver.find<ImportDriver>(
        IMPORT_MODULE,
        entry.driver,
      );

      if (!driver) {
        throw new Error(
          missingDriverMessage(IMPORT_MODULE, keyword, entry.driver),
        );
      }

      this.drivers.set(keyword, driver);
    }

    if (!this.drivers.has(this.defaultKeyword)) {
      throw new Error(
        `hery.config.ts sets import.default to "${this.defaultKeyword}", which is not declared in import.drivers (${this.formats.join(', ')}).`,
      );
    }
  }

  get defaultKeyword(): string {
    return this.config.import?.default ?? BUILTIN_DRIVER;
  }

  get formats(): string[] {
    return [...this.drivers.keys()];
  }

  /**
   * A format arriving with an upload is user input, so an unknown one is a 400
   * listing what is accepted -- the same treatment an unknown sort field gets.
   * That is a different failure from a driver declared in config and never
   * installed, which stopped the boot long before this ran.
   */
  resolve(format?: string): ImportDriver {
    const keyword = format ?? this.defaultKeyword;
    const driver = this.drivers.get(keyword);

    if (!driver) {
      throw new InvalidQueryException('import.format', this.formats);
    }

    return driver;
  }
}
