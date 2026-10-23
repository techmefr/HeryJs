import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { type RequestWithUser, SessionGuard } from '@heryjs/core/auth';
import { CapabilitiesGuard, Capability } from '@heryjs/core/capabilities';
import {
  ok,
  RateLimit,
  UnpaginatedRoute,
  ZodValidationPipe,
} from '@heryjs/core/http';
import { SsoConnectionTestService } from './sso-connection-test.service';
import { SsoConnectionService } from './sso-connection.service';
import {
  addDomainSchema,
  createConnectionSchema,
  updateConnectionSchema,
} from './sso.dto';
import type {
  AddDomainInput,
  CreateConnectionInput,
  UpdateConnectionInput,
} from './sso.dto';
import { canManageSso } from './sso.policy';

@Controller('sso/connections')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class SsoConnectionController {
  constructor(
    private readonly connections: SsoConnectionService,
    private readonly tests: SsoConnectionTestService,
  ) {}

  @UnpaginatedRoute(
    'a tenant holds a handful of identity providers, capped at creation',
  )
  @RateLimit('read')
  @Get()
  @Capability(canManageSso)
  async list(@Req() req: RequestWithUser) {
    return ok(await this.connections.list(req.user.tenantId));
  }

  @UnpaginatedRoute(
    'the health of the handful of identity providers a tenant holds, capped at creation',
  )
  @RateLimit('read')
  @Get('checks')
  @Capability(canManageSso)
  async checks(@Req() req: RequestWithUser) {
    return ok(await this.tests.testAll(req.user.tenantId));
  }

  @RateLimit('write')
  @Post(':id/test')
  @Capability(canManageSso)
  async test(@Req() req: RequestWithUser, @Param('id') id: string) {
    return ok(await this.tests.test(req.user.tenantId, id));
  }

  @RateLimit('read')
  @Get(':id')
  @Capability(canManageSso)
  async get(@Req() req: RequestWithUser, @Param('id') id: string) {
    return ok(await this.connections.get(req.user.tenantId, id));
  }

  @RateLimit('write')
  @Post()
  @Capability(canManageSso)
  async create(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(createConnectionSchema))
    body: CreateConnectionInput,
  ) {
    return ok(await this.connections.create(req.user.tenantId, body), [
      'SSO connection created.',
    ]);
  }

  @RateLimit('write')
  @Patch(':id')
  @Capability(canManageSso)
  async update(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateConnectionSchema))
    body: UpdateConnectionInput,
  ) {
    return ok(await this.connections.update(req.user.tenantId, id, body), [
      'SSO connection updated.',
    ]);
  }

  @RateLimit('write')
  @Delete(':id')
  @Capability(canManageSso)
  async remove(@Req() req: RequestWithUser, @Param('id') id: string) {
    await this.connections.remove(req.user.tenantId, id);

    return ok(null, ['SSO connection deleted.']);
  }

  @RateLimit('write')
  @Post(':id/domains')
  @Capability(canManageSso)
  async addDomain(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addDomainSchema)) body: AddDomainInput,
  ) {
    return ok(await this.connections.addDomain(req.user.tenantId, id, body), [
      'Domain added.',
    ]);
  }

  @RateLimit('write')
  @Post(':id/domains/:domain/verify')
  @Capability(canManageSso)
  async verifyDomain(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Param('domain') domain: string,
  ) {
    return ok(
      await this.connections.verifyDomain(req.user.tenantId, id, domain),
      ['Domain verified.'],
    );
  }

  @RateLimit('write')
  @Delete(':id/domains/:domain')
  @Capability(canManageSso)
  async removeDomain(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Param('domain') domain: string,
  ) {
    return ok(
      await this.connections.removeDomain(req.user.tenantId, id, domain),
      ['Domain removed.'],
    );
  }
}
