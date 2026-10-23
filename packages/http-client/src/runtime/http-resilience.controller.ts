import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { SessionGuard } from '#kernel/public/auth';
import { CapabilitiesGuard, Capability } from '#kernel/public/capabilities';
import {
  ok,
  RateLimit,
  UnpaginatedRoute,
  ZodValidationPipe,
} from '#kernel/public/http';
import { HttpResilienceService } from './http-resilience.service';
import {
  canManageHttpCircuits,
  canReadHttpCircuits,
} from './http-resilience.policy';

const settingsSchema = z
  .object({
    failureThreshold: z.number().int().min(1).max(1000),
    openMs: z.number().int().min(100).max(3_600_000),
    halfOpenProbes: z.number().int().min(1).max(100),
    maxConcurrent: z.number().int().min(1).max(10_000),
  })
  .partial();

type SettingsBody = z.infer<typeof settingsSchema>;

/**
 * The circuits of this process. State is per instance by design, so what an
 * operator sees and changes here is the instance that answered.
 */
@Controller('http-client')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class HttpResilienceController {
  constructor(private readonly resilience: HttpResilienceService) {}

  @UnpaginatedRoute(
    'one row per host this process has called, a set the code decides, not rows that grow',
  )
  @RateLimit('read')
  @Get('circuits')
  @Capability(canReadHttpCircuits)
  circuits() {
    return ok(this.resilience.circuits());
  }

  @RateLimit('write')
  @Post('circuits/:host/open')
  @Capability(canManageHttpCircuits)
  open(@Param('host') host: string) {
    return ok(this.resilience.open(host));
  }

  @RateLimit('write')
  @Post('circuits/:host/reset')
  @Capability(canManageHttpCircuits)
  reset(@Param('host') host: string) {
    return ok(this.resilience.reset(host));
  }

  @RateLimit('write')
  @Post('circuits/:host/settings')
  @Capability(canManageHttpCircuits)
  configure(
    @Param('host') host: string,
    @Body(new ZodValidationPipe(settingsSchema)) body: SettingsBody,
  ) {
    return ok(this.resilience.configure(host, body));
  }
}
