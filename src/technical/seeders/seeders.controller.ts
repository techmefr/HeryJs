import {
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
import { ok } from '../http/envelope';
import { TenantContextStorage } from '../tenancy/tenant-context';
import { SEEDERS } from './seeder.types';
import type { Seeder } from './seeder.types';

@Controller('seeders')
@UseGuards(SessionGuard)
export class SeedersController {
  constructor(@Inject(SEEDERS) private readonly seeders: Seeder[]) {}

  @Get()
  list() {
    return ok(
      this.seeders.map(({ name, description }) => ({ name, description })),
    );
  }

  @Post(':name/run')
  async run(@Param('name') name: string, @Req() req: RequestWithUser) {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException();
    }

    const seeder = this.seeders.find((candidate) => candidate.name === name);

    if (!seeder) {
      throw new NotFoundException();
    }

    const result = await seeder.run({
      tenantId: TenantContextStorage.getTenantId(),
      ownerId: req.user.id,
    });

    return ok(result);
  }
}
