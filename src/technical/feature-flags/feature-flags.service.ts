import { Injectable } from '@nestjs/common';
import type { PageQuery } from '#technical/http/page-query';
import { contextOf } from './feature-flag-evaluation';
import type { FeatureFlagContext } from './feature-flag-evaluation';
import type { FeatureFlagPatch } from './feature-flags-driver';
import { FeatureFlagsDriverRegistry } from './feature-flags-driver.registry';

/**
 * The facade every caller injects. It names what to do -- check a flag, list
 * them, set one -- never which driver does it, which is what lets a project
 * move from the local Postgres-backed driver to an external provider without
 * touching a call site.
 *
 * `isEnabled` and `evaluate` take either a tenant id, as they always did, or
 * a context naming the user, plan and attributes that rollout and targeting
 * decide on.
 */
@Injectable()
export class FeatureFlagsService {
  constructor(private readonly drivers: FeatureFlagsDriverRegistry) {}

  isEnabled(key: string, context?: string | FeatureFlagContext) {
    return this.drivers.active.isEnabled(key, contextOf(context));
  }

  evaluate(key: string, context?: string | FeatureFlagContext) {
    return this.drivers.active.evaluate(key, contextOf(context));
  }

  list(tenantId?: string) {
    return this.drivers.active.list(tenantId);
  }

  listAll(page: PageQuery) {
    return this.drivers.active.listAll(page);
  }

  set(key: string, patch: boolean | FeatureFlagPatch, tenantId?: string) {
    return this.drivers.active.set(
      key,
      typeof patch === 'boolean' ? { enabled: patch } : patch,
      tenantId,
    );
  }

  remove(key: string, tenantId?: string) {
    return this.drivers.active.remove(key, tenantId);
  }
}
