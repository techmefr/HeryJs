import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { HERY_CONFIG } from '#kernel/config/hery-config';
import type { HeryConfig } from '#kernel/config/hery-config.types';
import {
  DriverResolver,
  missingDriverMessage,
} from '#kernel/drivers/driver-resolver';
import { HTTP_CLIENT_MODULE } from '#kernel/http-client/http-client-driver';
import type { HttpClientDriver } from '#kernel/http-client/http-client-driver';
import { FakeHttpClientDriver } from './fake-http-client.driver';

const BUILTIN_DRIVER = 'fake';

/**
 * HTTP is a single-active-driver module, like mail: a resource says "GET this
 * URL", never "GET this URL over ofetch". So the registry exposes only
 * `active`, and the choice lives entirely in hery.config.ts.
 *
 * Every declared driver is still resolved at boot, not just the active one, so
 * a project running on the fake driver in development finds out the ofetch
 * package is missing on its own machine rather than the first time production
 * starts with HTTP_CLIENT_DRIVER=ofetch.
 *
 * Resolution runs in onModuleInit rather than the constructor because driver
 * modules are global but outside this module's import graph, so the lookup
 * needs every provider already instantiated.
 */
@Injectable()
export class HttpClientDriverRegistry implements OnModuleInit {
  private readonly drivers = new Map<string, HttpClientDriver>();

  constructor(
    @Inject(HERY_CONFIG) private readonly config: HeryConfig,
    private readonly fakeDriver: FakeHttpClientDriver,
    private readonly resolver: DriverResolver,
  ) {}

  onModuleInit(): void {
    const slice = this.config.httpClient;
    const declared = slice?.drivers ?? {
      [BUILTIN_DRIVER]: { driver: BUILTIN_DRIVER },
    };

    for (const [keyword, entry] of Object.entries(declared)) {
      if (entry.driver === BUILTIN_DRIVER) {
        this.drivers.set(keyword, this.fakeDriver);
        continue;
      }

      const driver = this.resolver.find<HttpClientDriver>(
        HTTP_CLIENT_MODULE,
        entry.driver,
      );

      if (!driver) {
        throw new Error(
          missingDriverMessage(HTTP_CLIENT_MODULE, keyword, entry.driver),
        );
      }

      this.drivers.set(keyword, driver);
    }

    const active = slice?.default ?? BUILTIN_DRIVER;

    // Checked here rather than left to the first call, because a default
    // naming an undeclared driver is the same class of mistake as a missing
    // package: a typo in one config line that would otherwise surface on
    // whichever request first happened to call out.
    if (!this.drivers.has(active)) {
      throw new Error(
        `hery.config.ts sets httpClient.default to "${active}", which is not declared in httpClient.drivers (${[...this.drivers.keys()].join(', ')}).`,
      );
    }
  }

  get active(): HttpClientDriver {
    const keyword = this.config.httpClient?.default ?? BUILTIN_DRIVER;
    const driver = this.drivers.get(keyword);

    if (!driver) {
      throw new Error(`HTTP client driver "${keyword}" was never resolved.`);
    }

    return driver;
  }
}
