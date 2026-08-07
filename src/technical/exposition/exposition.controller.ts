import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '#technical/auth/session.guard';
import type { RequestWithUser } from '#technical/auth/session.guard';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { Capability } from '#technical/capabilities/capability.decorator';
import { subjectOf } from '#technical/capabilities/subject';
import { ok } from '#technical/http/envelope';
import { UnpaginatedRoute } from '#technical/http/unpaginated-route.decorator';
import { canReachExposedActions } from './exposition.policy';
import { describeAction } from './exposition-describe';
import { ExpositionRunner } from './exposition-runner.service';
import { ExpositionRegistry } from './exposition.registry';

@Controller('expose')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class ExpositionController {
  constructor(
    private readonly registry: ExpositionRegistry,
    private readonly runner: ExpositionRunner,
  ) {}

  /**
   * The catalog answers "what can *you* run", not "what exists": an action's
   * name and parameter schema describe an operation the caller may not be
   * allowed anywhere near, so the same capability that gates running it gates
   * seeing it. Resolved per request, against the caller's own subject.
   */
  @UnpaginatedRoute(
    'the actions declared in code, as long as the code that declares them',
  )
  @Get()
  @Capability(canReachExposedActions)
  list(@Req() request: RequestWithUser) {
    const subject = subjectOf(request.user);

    return ok(
      this.registry
        .all()
        .filter((action) => action.capability(subject).allowed)
        .map(describeAction),
    );
  }

  @Post(':action')
  @Capability(canReachExposedActions)
  async run(
    @Param('action') action: string,
    @Body() body: Record<string, unknown>,
    @Req() request: RequestWithUser,
  ) {
    return ok(await this.runner.run(action, body ?? {}, request.user));
  }
}
