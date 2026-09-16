import { Global, Module } from '@nestjs/common';
import { httpClientDriverToken } from '#kernel/http-client/http-client-driver';
import { OfetchHttpClientDriver } from './ofetch-http-client.driver';

const TOKEN = httpClientDriverToken('ofetch');

/**
 * A factory rather than plain class registration: the driver takes its fetcher
 * and sleeper as constructor parameters with defaults, and Nest would
 * otherwise try to resolve them as providers.
 */
@Global()
@Module({
  providers: [
    {
      provide: OfetchHttpClientDriver,
      useFactory: () => new OfetchHttpClientDriver(),
    },
    { provide: TOKEN, useExisting: OfetchHttpClientDriver },
  ],
  exports: [TOKEN],
})
export class OfetchHttpClientModule {}
