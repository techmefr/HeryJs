import { Injectable } from '@nestjs/common';
import type { PageQuery } from '#technical/http/page-query';
import { FeatureFlagsDriverRegistry } from './feature-flags-driver.registry';

/**
 * The facade every caller injects. It names what to do -- check a flag, list
 * them, set one -- never which driver does it, which is what lets a project
 * move from the local Postgres-backed driver to an external provider without
 * touching a call site.
 */
@Injectable()
export class FeatureFlagsService {
  constructor(private readonly drivers: FeatureFlagsDriverRegistry) {}

  isEnabled(key: string, tenantId?: string): Promise<boolean> {
    return this.drivers.active.isEnabled(key, tenantId);
  }

  list(tenantId?: string) {
    return this.drivers.active.list(tenantId);
  }

  listAll(page: PageQuery) {
    return this.drivers.active.listAll(page);
  }

  set(key: string, enabled: boolean, tenantId?: string) {
    return this.drivers.active.set(key, enabled, tenantId);
  }
}
