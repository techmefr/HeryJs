import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { SessionGuard } from '#technical/auth/session.guard';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { Capability } from '#technical/capabilities/capability.decorator';
import { ok } from '#technical/http/envelope';
import { okPage, parsePageQuery } from '#technical/http/page-query';
import { UnpaginatedRoute } from '#technical/http/unpaginated-route.decorator';
import { RateLimit } from '#technical/rate-limit/rate-limit.decorator';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { ZodValidationPipe } from '#technical/validation/zod-validation.pipe';
import { canManageJobFlows, canReadJobFlows } from './job-flow.policy';
import { JobFlowsService } from './job-flows.service';

const startBodySchema = z.object({
  input: z.record(z.string(), z.unknown()).default({}),
});

type StartBody = z.infer<typeof startBodySchema>;

/**
 * Every route is bound to the caller's own tenant: a flow id from another
 * tenant answers 404, the same as one that never existed.
 */
@Controller('job-flows')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class JobFlowsController {
  constructor(private readonly flows: JobFlowsService) {}

  @RateLimit('read')
  @Get()
  @Capability(canReadJobFlows)
  async list(@Query() query: unknown) {
    const page = parsePageQuery(query);

    return okPage(
      await this.flows.list(TenantContextStorage.getTenantId(), page),
      page,
    );
  }

  @UnpaginatedRoute(
    'the flows declared in code, as long as the code that declares them',
  )
  @RateLimit('read')
  @Get('definitions')
  @Capability(canReadJobFlows)
  definitions() {
    return ok(this.flows.listDefinitions());
  }

  @RateLimit('write')
  @Post('definitions/:name/start')
  @Capability(canManageJobFlows)
  async start(
    @Param('name') name: string,
    @Body(new ZodValidationPipe(startBodySchema)) body: StartBody,
  ) {
    return ok(await this.flows.startDefined(name, body.input));
  }

  @RateLimit('read')
  @Get(':id')
  @Capability(canReadJobFlows)
  async detail(@Param('id') id: string) {
    return ok(await this.flows.detail(TenantContextStorage.getTenantId(), id));
  }

  @RateLimit('write')
  @Post(':id/retry')
  @Capability(canManageJobFlows)
  async retry(@Param('id') id: string) {
    return ok(await this.flows.retry(TenantContextStorage.getTenantId(), id));
  }

  @RateLimit('write')
  @Post(':id/cancel')
  @Capability(canManageJobFlows)
  async cancel(@Param('id') id: string) {
    return ok(await this.flows.cancel(TenantContextStorage.getTenantId(), id));
  }
}
