import {
  Controller,
  Get,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '#technical/auth/session.guard';
import { RateLimit } from '#technical/rate-limit/rate-limit.decorator';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { Capability } from '#technical/capabilities/capability.decorator';
import { HealthRegistry } from '#technical/health/health-registry';
import type { HealthReport } from '#technical/health/health-check';
import { canReadHealth } from './monitoring.policy';
import { UnpaginatedRoute } from '#technical/http/unpaginated-route.decorator';

@Controller('health')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class HealthController {
  constructor(private readonly registry: HealthRegistry) {}

  @UnpaginatedRoute('one object, not a collection')
  @RateLimit('read')
  @Get()
  @Capability(canReadHealth)
  async check(): Promise<HealthReport> {
    const report = await this.registry.report('readiness');

    if (report.status === 'error') {
      throw new ServiceUnavailableException(report);
    }

    return report;
  }
}
