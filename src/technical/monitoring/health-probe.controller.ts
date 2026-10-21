import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PublicRoute } from '#technical/capabilities/public-route.decorator';
import { UnthrottledRoute } from '#technical/rate-limit/rate-limit.decorator';
import { HealthRegistry } from '#technical/health/health-registry';
import type { HealthProbe, HealthReport } from '#technical/health/health-check';
import { UnpaginatedRoute } from '#technical/http/unpaginated-route.decorator';

interface ProbeAnswer {
  status: HealthReport['status'];
}

@Controller('health')
export class HealthProbeController {
  constructor(private readonly registry: HealthRegistry) {}

  @UnpaginatedRoute('one object, not a collection')
  @UnthrottledRoute('an orchestrator probes this every few seconds')
  @Get('live')
  @PublicRoute(
    'a liveness probe has no caller to authenticate and answers only whether the process is up',
  )
  live(@Res({ passthrough: true }) response: Response): Promise<ProbeAnswer> {
    return this.answer('liveness', response);
  }

  @UnpaginatedRoute('one object, not a collection')
  @UnthrottledRoute('an orchestrator probes this every few seconds')
  @Get('ready')
  @PublicRoute(
    'a readiness probe has no caller to authenticate and answers only ok or error, the detail stays on the authenticated /health',
  )
  ready(@Res({ passthrough: true }) response: Response): Promise<ProbeAnswer> {
    return this.answer('readiness', response);
  }

  private async answer(
    probe: HealthProbe,
    response: Response,
  ): Promise<ProbeAnswer> {
    const { status } = await this.registry.report(probe);

    response.status(
      status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE,
    );

    return { status };
  }
}
