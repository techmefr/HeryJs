import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { SessionGuard } from '#technical/auth/session.guard';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { Capability } from '#technical/capabilities/capability.decorator';
import { canReadMetrics } from './monitoring.policy';
import { metricsRegistry } from './metrics.registry';
import { UnpaginatedRoute } from '#technical/http/unpaginated-route.decorator';

/**
 * A scrape is a caller like any other. Prometheus has no session, so it
 * authenticates with an API key -- the credential this framework already ships
 * for non-interactive callers -- carried in the same Authorization header.
 */
@Controller('metrics')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class MetricsController {
  @UnpaginatedRoute(
    'the Prometheus text format, which the scraper reads whole or not at all',
  )
  @Get()
  @Capability(canReadMetrics)
  @Header('Content-Type', 'text/plain')
  metrics() {
    return metricsRegistry.metrics();
  }
}
