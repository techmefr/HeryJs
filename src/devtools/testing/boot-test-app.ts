import { DynamicModule, INestApplication, Module } from '@nestjs/common';
import type { ModuleMetadata } from '@nestjs/common';
import { WorkerHost } from '@nestjs/bullmq';
import { DiscoveryService } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { HERY_CONFIG, heryConfig } from '#technical/config/hery-config';
import type {
  HeryConfig,
  HeryConfigDrivers,
} from '#technical/config/hery-config.types';
import { EventDispatcher } from '#technical/events/event-dispatcher.service';
import { JobsService } from '#technical/jobs/jobs.service';
import { LockService } from '#technical/lock/lock.service';
import { mailDriverToken } from '#technical/mail/mail-driver';
import { pushDriverToken } from '#technical/push/push-driver';
import { smsDriverToken } from '#technical/sms/sms-driver';
import { storageDriverToken } from '#technical/storage/storage-driver';
import { actingAs, actingAsApiKey } from './acting-as';
import type { Actor, ActingAsOptions } from './acting-as';
import {
  createTestFakes,
  DEFAULT_FAKE_NAMES,
  resetTestFakes,
} from './test-fakes';
import type { TestFakeName, TestFakes } from './test-fakes';
import { createTestTenantId, purgeTenant } from './tenant-isolation';

export const FAKE_DRIVER_NAME = 'fake';

export interface BootTestAppOptions {
  fakes?: TestFakeName[] | 'all' | 'none';
  isolation?: 'none' | 'tenant';
  imports?: ModuleMetadata['imports'];
}

export interface TestApp {
  app: INestApplication<App>;
  fakes: TestFakes;
  tenantId: string | null;
  actingAs(options?: ActingAsOptions): Promise<Actor>;
  actingAsApiKey(options?: ActingAsOptions): Promise<Actor>;
  close(): Promise<void>;
}

const FAKE_DRIVERS: HeryConfigDrivers = {
  default: FAKE_DRIVER_NAME,
  drivers: { [FAKE_DRIVER_NAME]: { driver: FAKE_DRIVER_NAME } },
};

function selectedFakes(option: BootTestAppOptions['fakes']): Set<TestFakeName> {
  if (option === 'none') {
    return new Set();
  }

  if (option === 'all') {
    return new Set<TestFakeName>([
      ...DEFAULT_FAKE_NAMES,
      'notifier',
      'jobs',
      'events',
      'locks',
      'clock',
    ]);
  }

  return new Set(option ?? DEFAULT_FAKE_NAMES);
}

function fakeDriversModule(
  fakes: TestFakes,
  selected: Set<TestFakeName>,
): DynamicModule {
  const providers = [
    selected.has('mail') && {
      provide: mailDriverToken(FAKE_DRIVER_NAME),
      useValue: fakes.mail,
    },
    selected.has('sms') && {
      provide: smsDriverToken(FAKE_DRIVER_NAME),
      useValue: fakes.sms,
    },
    selected.has('push') && {
      provide: pushDriverToken(FAKE_DRIVER_NAME),
      useValue: fakes.push,
    },
    selected.has('storage') && {
      provide: storageDriverToken(FAKE_DRIVER_NAME),
      useValue: fakes.storage,
    },
  ].filter((provider) => provider !== false);

  @Module({})
  class TestFakeDriversModule {}

  return {
    module: TestFakeDriversModule,
    global: true,
    providers,
    exports: providers.map((provider) => provider.provide),
  };
}

function configWithFakeDrivers(selected: Set<TestFakeName>): HeryConfig {
  return {
    ...heryConfig,
    ...(selected.has('mail') && { mail: FAKE_DRIVERS }),
    ...(selected.has('sms') && { sms: FAKE_DRIVERS }),
    ...(selected.has('push') && { push: FAKE_DRIVERS }),
    ...(selected.has('storage') && { storage: FAKE_DRIVERS }),
  };
}

async function closeQueueWorkers(app: INestApplication<App>): Promise<void> {
  const workerHosts = app
    .get(DiscoveryService)
    .getProviders()
    .map((wrapper) => wrapper.instance as unknown)
    .filter(
      (instance): instance is WorkerHost => instance instanceof WorkerHost,
    );

  await Promise.all(workerHosts.map((host) => host.worker.close()));
}

export async function bootTestApp(
  options: BootTestAppOptions = {},
): Promise<TestApp> {
  const selected = selectedFakes(options.fakes);
  const fakes = createTestFakes();
  const tenantId = options.isolation === 'tenant' ? createTestTenantId() : null;

  let builder = Test.createTestingModule({
    imports: [
      AppModule,
      ...(options.imports ?? []),
      fakeDriversModule(fakes, selected),
    ],
  })
    .overrideProvider(HERY_CONFIG)
    .useValue(configWithFakeDrivers(selected));

  if (selected.has('jobs')) {
    builder = builder.overrideProvider(JobsService).useValue(fakes.jobs);
  }

  if (selected.has('events')) {
    builder = builder.overrideProvider(EventDispatcher).useValue(fakes.events);
  }

  if (selected.has('locks')) {
    builder = builder.overrideProvider(LockService).useValue(fakes.locks);
  }

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  await app.init();

  if (selected.has('jobs')) {
    await closeQueueWorkers(app);
  }

  if (selected.has('notifier')) {
    fakes.notifier.install();
  }

  if (selected.has('clock')) {
    fakes.clock.freeze();
  }

  return {
    app,
    fakes,
    tenantId,
    actingAs: (actorOptions = {}) =>
      actingAs(app, { tenantId: tenantId ?? undefined, ...actorOptions }),
    actingAsApiKey: (actorOptions = {}) =>
      actingAsApiKey(app, { tenantId: tenantId ?? undefined, ...actorOptions }),
    close: async () => {
      resetTestFakes(fakes);
      fakes.notifier.uninstall();
      await app.close();

      if (tenantId !== null) {
        await purgeTenant(tenantId);
      }
    },
  };
}
