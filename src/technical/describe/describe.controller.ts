import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { DevOnlyGuard } from '../dev-only/dev-only.guard';
import { ok } from '../http/envelope';
import { DescribeService } from './describe.service';

@Controller('describe')
@UseGuards(SessionGuard, DevOnlyGuard)
export class DescribeController {
  constructor(private readonly describe: DescribeService) {}

  @Get()
  list() {
    return ok(this.describe.all());
  }
}
