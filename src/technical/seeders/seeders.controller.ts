import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import type { RequestWithUser } from '../auth/session.guard';
import { DevOnlyGuard } from '../dev-only/dev-only.guard';
import { InvalidQueryException } from '../errors/invalid-query.exception';
import { ok } from '../http/envelope';
import { TenantContextStorage } from '../tenancy/tenant-context';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';
import { runSeederSchema } from './run-seeder.dto';
import type { RunSeederDto } from './run-seeder.dto';
import { SEEDERS } from './seeder.types';
import type { Seeder } from './seeder.types';

@Controller('seeders')
@UseGuards(SessionGuard, DevOnlyGuard)
export class SeedersController {
  constructor(@Inject(SEEDERS) private readonly seeders: Seeder[]) {}

  @Get()
  list() {
    return ok(
      this.seeders.map(({ name, description, defaultCount, maxCount }) => ({
        name,
        description,
        defaultCount,
        maxCount,
      })),
    );
  }

  @Post(':name/run')
  async run(
    @Param('name') name: string,
    @Body(new ZodValidationPipe(runSeederSchema)) body: RunSeederDto,
    @Req() req: RequestWithUser,
  ) {
    const seeder = this.seeders.find((candidate) => candidate.name === name);

    if (!seeder) {
      throw new NotFoundException();
    }

    if (body.count !== undefined && body.count > seeder.maxCount) {
      throw new InvalidQueryException('count', [`1..${seeder.maxCount}`]);
    }

    const result = await seeder.run(
      {
        tenantId: TenantContextStorage.getTenantId(),
        ownerId: req.user.id,
      },
      { count: body.count },
    );

    return ok(result);
  }
}
