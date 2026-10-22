import { Injectable, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import {
  translateAdminAction,
  translateAdminSection,
} from '#technical/admin/admin-labels';
import { CAPABILITY_CHECK } from '#technical/capabilities/capability.decorator';
import type { PolicyCheck } from '#technical/capabilities/capability-check';
import {
  ADMIN_ACTION,
  ADMIN_SECTION,
  type AdminActionOptions,
  type AdminSectionOptions,
} from '#technical/admin/admin-metadata';
import { PUBLIC_ROUTE_REASON } from '#technical/capabilities/public-route.decorator';
import {
  RATE_LIMIT_BUCKET,
  RATE_LIMIT_EXEMPT,
} from '#technical/rate-limit/rate-limit.decorator';

export interface DescribedRoute {
  method: string;
  path: string;
  handler: string;
  capability?: string;
  publicReason?: string;
  rateLimit?: string;
  rateLimitExemption?: string;
  admin?: AdminContribution;
}

export type AdminContribution =
  | ({ kind: 'section' } & AdminSectionOptions)
  | ({ kind: 'action' } & AdminActionOptions);

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
      .flatMap((handler) =>
        this.describeRoute(target, target.prototype, handler),
      );

    return { name: target.name, basePath: normalize(basePath), routes };
  }

  private describeRoute(
    controller: object,
    prototype: object,
    handler: string,
  ): DescribedRoute[] {
    const target = (prototype as Record<string, unknown>)[handler];

    if (typeof target !== 'function') {
      return [];
    }

    const method = this.metadata<RequestMethod>(METHOD_METADATA, target);

    if (method === undefined) {
      return [];
    }

    const check = this.metadata<PolicyCheck>(CAPABILITY_CHECK, target);
    const section = this.metadata<AdminSectionOptions>(ADMIN_SECTION, target);
    const action = this.metadata<AdminActionOptions>(ADMIN_ACTION, target);

    return [
      {
        method: RequestMethod[method],
        path: normalize(this.metadata<string>(PATH_METADATA, target) ?? ''),
        handler,
        capability: check?.name ? check.name : undefined,
        publicReason: this.inherited<string>(
          PUBLIC_ROUTE_REASON,
          target,
          controller,
        ),
        rateLimit: this.inherited<string>(
          RATE_LIMIT_BUCKET,
          target,
          controller,
        ),
        rateLimitExemption: this.inherited<string>(
          RATE_LIMIT_EXEMPT,
          target,
          controller,
        ),
        admin: section
          ? { kind: 'section', ...translateAdminSection(section) }
          : action
            ? { kind: 'action', ...translateAdminAction(action) }
            : undefined,
      },
    ];
  }

  private inherited<T>(
    key: string,
    handler: object,
    controller: object,
  ): T | undefined {
    return this.metadata<T>(key, handler) ?? this.metadata<T>(key, controller);
  }

  private metadata<T>(key: string, target: object): T | undefined {
    return Reflect.getMetadata(key, target) as T | undefined;
  }
}

function normalize(path: string): string {
  const trimmed = path.replace(/^\/+|\/+$/g, '');
  return trimmed === '' ? '/' : `/${trimmed}`;
}
