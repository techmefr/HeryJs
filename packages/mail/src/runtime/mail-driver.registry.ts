import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { HERY_CONFIG, type HeryConfig } from '#kernel/public/config';
import {
  DriverResolver,
  MAIL_MODULE,
  type MailDriver,
  missingDriverMessage,
} from '#kernel/public/drivers';
import { LogMailDriver } from './log-mail.driver';

const BUILTIN_DRIVER = 'log';

/**
 * Mail is a single-active-driver module: the caller says "send this", never
 * "send this over SMTP". So the registry exposes only `active`, and the choice
 * lives entirely in hery.config.ts.
 *
 * Every declared driver is still resolved at boot, not just the active one. A
 * project that declares SMTP but runs on log in development should find out
 * that the SMTP package is missing on its own machine, not the first time
 * production starts with MAIL_DRIVER=smtp.
 *
 * Resolution runs in onModuleInit rather than the constructor because driver
 * modules are global but outside this module's import graph, so the lookup
 * needs every provider already instantiated.
 */
@Injectable()
export class MailDriverRegistry implements OnModuleInit {
  private readonly drivers = new Map<string, MailDriver>();

  constructor(
    @Inject(HERY_CONFIG) private readonly config: HeryConfig,
    private readonly logDriver: LogMailDriver,
    private readonly resolver: DriverResolver,
  ) {}

  onModuleInit(): void {
    const declared = this.config.mail?.drivers ?? {
      [BUILTIN_DRIVER]: { driver: BUILTIN_DRIVER },
    };

    for (const [keyword, entry] of Object.entries(declared)) {
      if (entry.driver === BUILTIN_DRIVER) {
        this.drivers.set(keyword, this.logDriver);
        continue;
      }

      const driver = this.resolver.find<MailDriver>(MAIL_MODULE, entry.driver);

      if (!driver) {
        throw new Error(
          missingDriverMessage(MAIL_MODULE, keyword, entry.driver),
        );
      }

      this.drivers.set(keyword, driver);
    }

    const active = this.config.mail?.default ?? BUILTIN_DRIVER;

    // Checked here rather than left to the first send, because a default
    // naming an undeclared driver is the same class of mistake as a missing
    // package: a typo in one config line that would otherwise surface as a
    // runtime failure on whichever request first tried to send mail.
    if (!this.drivers.has(active)) {
      throw new Error(
        `hery.config.ts sets mail.default to "${active}", which is not declared in mail.drivers (${[...this.drivers.keys()].join(', ')}).`,
      );
    }
  }

  /**
   * What the admin shows an operator: which driver is active and which others
   * the config declares. Names only -- nothing here reads a credential.
   */
  get summary(): { active: string; declared: string[] } {
    return {
      active: this.config.mail?.default ?? BUILTIN_DRIVER,
      declared: [...this.drivers.keys()],
    };
  }

  get active(): MailDriver {
    const keyword = this.config.mail?.default ?? BUILTIN_DRIVER;
    const driver = this.drivers.get(keyword);

    if (!driver) {
      throw new Error(`Mail driver "${keyword}" was never resolved.`);
    }

    return driver;
  }
}
