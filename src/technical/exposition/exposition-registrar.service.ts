import { Injectable, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import { EXPOSED_ACTION, EXPOSED_PARAMS } from './exposition.decorators';
import { ExpositionRegistry } from './exposition.registry';
import type { ExposedActionMeta, ExposedParam } from './exposition.types';

@Injectable()
export class ExpositionRegistrar implements OnModuleInit {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly registry: ExpositionRegistry,
  ) {}

  onModuleInit(): void {
    for (const wrapper of this.discovery.getProviders()) {
      const instance = wrapper.instance as Record<string, unknown> | null;
      if (!instance || typeof instance !== 'object') continue;

      const prototype = Object.getPrototypeOf(instance) as object | null;
      if (!prototype) continue;

      for (const handler of this.scanner.getAllMethodNames(prototype)) {
        const method = (prototype as Record<string, unknown>)[handler];
        if (typeof method !== 'function') continue;

        const action = Reflect.getMetadata(EXPOSED_ACTION, method) as
          ExposedActionMeta | undefined;
        if (!action) continue;

        const paramsByIndex =
          (Reflect.getMetadata(EXPOSED_PARAMS, prototype, handler) as
            Record<number, ExposedParam> | undefined) ?? {};

        const params = Object.keys(paramsByIndex)
          .map(Number)
          .sort((left, right) => left - right)
          .map((index) => paramsByIndex[index]!);

        this.registry.register({
          ...action,
          params,
          invoke: (args: unknown[]) =>
            (instance[handler] as (...values: unknown[]) => unknown).apply(
              instance,
              args,
            ),
        });
      }
    }
  }
}
