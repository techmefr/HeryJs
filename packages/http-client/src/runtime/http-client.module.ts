import { Module } from '@nestjs/common';
import { HeryConfigModule } from '#kernel/config/hery-config.module';
import { DriversModule } from '#kernel/drivers/drivers.module';
import { FakeHttpClientDriver } from './fake-http-client.driver';
import { HttpClientDriverRegistry } from './http-client-driver.registry';
import { HttpClientService } from './http-client.service';

/**
 * `FakeHttpClientDriver` is exported alongside the service, which is the one
 * documented exception to "the facade is the only thing callers inject": a test
 * has to reach the fake to stub an endpoint, and going through the registry to
 * get there would mean callers learning how driver resolution works.
 */
@Module({
  imports: [HeryConfigModule, DriversModule],
  providers: [
    HttpClientService,
    HttpClientDriverRegistry,
    FakeHttpClientDriver,
  ],
  exports: [HttpClientService, FakeHttpClientDriver],
})
export class HttpClientModule {}
