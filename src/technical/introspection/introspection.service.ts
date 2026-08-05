import { Injectable, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import { CAPABILITY_CHECK } from '#technical/capabilities/capability.decorator';
import type { PolicyCheck } from '#technical/capabilities/capability-check';

export interface DescribedRoute {
  method: string;
  path: string;
  handler: string;
  capability?: string;
}

export interface DescribedController {
  name: string;
  basePath: string;
  routes: DescribedRoute[];
}

// Reflecting Nest's own router rather than parsing source files keeps the
// runtime free of any dependency on the generator, and describes what is
// actually wired instead of what happens to be on disk.
@Injectable()
export class IntrospectionService {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
  ) {}

  all(): DescribedController[] {
    return this.discovery
      .getControllers()
      .flatMap((wrapper) =>
        wrapper.metatype ? [this.describe(wrapper.metatype)] : [],
      )
      .filter((controller) => controller.routes.length > 0)
      .sort((left, right) => left.basePath.localeCompare(right.basePath));
  }

  private describe(metatype: NonNullable<unknown>): DescribedController {
    const target = metatype as { name: string; prototype: object };
    const basePath = this.metadata<string>(PATH_METADATA, target) ?? '';

    const routes = this.scanner
      .getAllMethodNames(target.prototype)
      .flatMap((handler) => this.describeRoute(target.prototype, handler));

    return { name: target.name, basePath: normalize(basePath), routes };
  }

  private describeRoute(prototype: object, handler: string): DescribedRoute[] {
    const target = (prototype as Record<string, unknown>)[handler];

    if (typeof target !== 'function') {
      return [];
    }

    const method = this.metadata<RequestMethod>(METHOD_METADATA, target);

    if (method === undefined) {
      return [];
    }

    const check = this.metadata<PolicyCheck>(CAPABILITY_CHECK, target);

    return [
      {
        method: RequestMethod[method],
        path: normalize(this.metadata<string>(PATH_METADATA, target) ?? ''),
        handler,
        capability: check?.name ? check.name : undefined,
      },
    ];
  }

  private metadata<T>(key: string, target: object): T | undefined {
    return Reflect.getMetadata(key, target) as T | undefined;
  }
}

function normalize(path: string): string {
  const trimmed = path.replace(/^\/+|\/+$/g, '');
  return trimmed === '' ? '/' : `/${trimmed}`;
}
