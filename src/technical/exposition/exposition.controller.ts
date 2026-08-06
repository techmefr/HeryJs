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
import { ok } from '#technical/http/envelope';
import { describeAction } from './exposition-describe';
import { ExpositionRunner } from './exposition-runner.service';
import { ExpositionRegistry } from './exposition.registry';

@Controller('expose')
@UseGuards(SessionGuard)
export class ExpositionController {
  constructor(
    private readonly registry: ExpositionRegistry,
    private readonly runner: ExpositionRunner,
  ) {}

  @Get()
  list() {
    return ok(this.registry.all().map(describeAction));
  }

  @Post(':action')
  async run(
    @Param('action') action: string,
    @Body() body: Record<string, unknown>,
    @Req() request: RequestWithUser,
  ) {
    return ok(await this.runner.run(action, body ?? {}, request.user));
  }
}
