import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { HERY_CONFIG } from '#kernel/config/hery-config';
import type { HeryConfig } from '#kernel/config/hery-config.types';
import {
  DriverResolver,
  missingDriverMessage,
} from '#kernel/drivers/driver-resolver';
import { EXPORT_MODULE } from '#kernel/export/export-driver';
import type { ExportDriver } from '#kernel/export/export-driver';
import { InvalidQueryException } from '#kernel/errors/invalid-query.exception';
import { CsvExportDriver } from './csv-export.driver';

const BUILTIN_DRIVER = 'csv';

/**
 * Export is the per-call half of the convention: the format is part of what
 * the caller is asking for -- a user clicked "download as PDF" -- so it
 * belongs in the call, not in config. Every declared driver stays resolved and
 * usable at once, and `default` only says which one `as()` means when it is
 * given nothing.
 *
 * That is the single difference from mail's registry. Resolution, the boot-time
 * failure and the built-in driver all work identically, which is the point of
 * having one convention rather than two.
 */
@Injectable()
export class ExportDriverRegistry implements OnModuleInit {
  private readonly drivers = new Map<string, ExportDriver>();

  constructor(
    @Inject(HERY_CONFIG) private readonly config: HeryConfig,
    private readonly csvDriver: CsvExportDriver,
    private readonly resolver: DriverResolver,
  ) {}

  onModuleInit(): void {
    const declared = this.config.export?.drivers ?? {
      [BUILTIN_DRIVER]: { driver: BUILTIN_DRIVER },
    };

    for (const [keyword, entry] of Object.entries(declared)) {
      if (entry.driver === BUILTIN_DRIVER) {
        this.drivers.set(keyword, this.csvDriver);
        continue;
      }

      const driver = this.resolver.find<ExportDriver>(
        EXPORT_MODULE,
        entry.driver,
      );

      if (!driver) {
        throw new Error(
          missingDriverMessage(EXPORT_MODULE, keyword, entry.driver),
        );
      }

      this.drivers.set(keyword, driver);
    }

    if (!this.drivers.has(this.defaultKeyword)) {
      throw new Error(
        `hery.config.ts sets export.default to "${this.defaultKeyword}", which is not declared in export.drivers (${this.formats.join(', ')}).`,
      );
    }
  }

  get defaultKeyword(): string {
    return this.config.export?.default ?? BUILTIN_DRIVER;
  }

  get formats(): string[] {
    return [...this.drivers.keys()];
  }

  /**
   * A format arriving from a request is user input, so an unknown one is a 400
   * listing what is available -- the same treatment an unknown sort field
   * gets. That is a different failure from a driver declared in config and
   * never installed, which stopped the boot long before this ran.
   */
  resolve(format?: string): ExportDriver {
    const keyword = format ?? this.defaultKeyword;
    const driver = this.drivers.get(keyword);

    if (!driver) {
      throw new InvalidQueryException('export.format', this.formats);
    }

    return driver;
  }
}
