import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { PublicRoute } from '@heryjs/core/capabilities';
import { RateLimit, UnpaginatedRoute } from '@heryjs/core/http';
import { SCIM_BASE_PATH } from './scim.types';
import { ScimActivityService } from './scim-activity.service';
import {
  resourceTypes,
  schemas,
  serviceProviderConfig,
} from './scim-discovery';
import { ScimExceptionFilter } from './scim-exception.filter';
import { parseScimListQuery } from './scim-filter';
import { ScimGroupsService } from './scim-groups.service';
import {
  listResponse,
  toGroupResource,
  toUserResource,
} from './scim-resources';
import { ScimTokenGuard } from './scim-token.guard';
import type { ScimRequest } from './scim-token.guard';
import { ScimUsersService } from './scim-users.service';

interface ListParams {
  filter?: string;
  startIndex?: string;
  count?: string;
}

function baseUrlOf(request: ScimRequest): string {
  return `${request.protocol}://${request.get('host') ?? 'localhost'}`;
}

const PUBLIC_REASON =
  'authenticated by the tenant SCIM bearer token, not by a user session';
const PAGED_REASON = 'paged by startIndex and count, capped at 100';

@Controller(SCIM_BASE_PATH.slice(1))
@UseGuards(ScimTokenGuard)
@UseFilters(ScimExceptionFilter)
export class ScimController {
  constructor(
    private readonly users: ScimUsersService,
    private readonly groups: ScimGroupsService,
    private readonly activity: ScimActivityService,
  ) {}

  @PublicRoute(PUBLIC_REASON)
  @UnpaginatedRoute('a single configuration document')
  @RateLimit('read')
  @Get('ServiceProviderConfig')
  config(@Req() req: ScimRequest) {
    return serviceProviderConfig(baseUrlOf(req));
  }

  @PublicRoute(PUBLIC_REASON)
  @UnpaginatedRoute('two resource types')
  @RateLimit('read')
  @Get('ResourceTypes')
  types(@Req() req: ScimRequest) {
    return resourceTypes(baseUrlOf(req));
  }

  @PublicRoute(PUBLIC_REASON)
  @UnpaginatedRoute('two schemas')
  @RateLimit('read')
  @Get('Schemas')
  schemaList(@Req() req: ScimRequest) {
    return schemas(baseUrlOf(req));
  }

  @PublicRoute(PUBLIC_REASON)
  @UnpaginatedRoute(PAGED_REASON)
  @RateLimit('read')
  @Get('Users')
  async listUsers(@Req() req: ScimRequest, @Query() query: ListParams) {
    const parsed = parseScimListQuery(query, 'user');
    const page = await this.users.list(req.scim.tenantId, parsed);
    const base = baseUrlOf(req);

    return listResponse(
      page.rows.map((row) => toUserResource(row, base)),
      page.total,
      parsed.startIndex,
    );
  }

  @PublicRoute(PUBLIC_REASON)
  @RateLimit('read')
  @Get('Users/:id')
  async getUser(@Req() req: ScimRequest, @Param('id') id: string) {
    return toUserResource(
      await this.users.get(req.scim.tenantId, id),
      baseUrlOf(req),
    );
  }

  @PublicRoute(PUBLIC_REASON)
  @RateLimit('write')
  @Post('Users')
  async createUser(@Req() req: ScimRequest, @Body() body: unknown) {
    const outcome = await this.users.create(req.scim.tenantId, body);

    await this.activity.record(req.scim.tenantId, {
      resource: 'user',
      action: outcome.action,
      resourceId: outcome.row.id,
      detail: outcome.row.email,
    });

    return toUserResource(outcome.row, baseUrlOf(req));
  }

  @PublicRoute(PUBLIC_REASON)
  @RateLimit('write')
  @Put('Users/:id')
  @HttpCode(200)
  async replaceUser(
    @Req() req: ScimRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.writeUser(
      req,
      await this.users.replace(req.scim.tenantId, id, body),
    );
  }

  @PublicRoute(PUBLIC_REASON)
  @RateLimit('write')
  @Patch('Users/:id')
  async patchUser(
    @Req() req: ScimRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.writeUser(
      req,
      await this.users.patch(req.scim.tenantId, id, body),
    );
  }

  @PublicRoute(PUBLIC_REASON)
  @RateLimit('write')
  @Delete('Users/:id')
  @HttpCode(204)
  async deactivateUser(@Req() req: ScimRequest, @Param('id') id: string) {
    const outcome = await this.users.deactivate(req.scim.tenantId, id);

    await this.activity.record(req.scim.tenantId, {
      resource: 'user',
      action: outcome.action,
      resourceId: outcome.row.id,
      detail: outcome.row.email,
    });
  }

  @PublicRoute(PUBLIC_REASON)
  @UnpaginatedRoute(PAGED_REASON)
  @RateLimit('read')
  @Get('Groups')
  async listGroups(@Req() req: ScimRequest, @Query() query: ListParams) {
    const parsed = parseScimListQuery(query, 'group');
    const page = await this.groups.list(req.scim.tenantId, parsed);
    const base = baseUrlOf(req);

    return listResponse(
      page.rows.map((row) => toGroupResource(row, base)),
      page.total,
      parsed.startIndex,
    );
  }

  @PublicRoute(PUBLIC_REASON)
  @RateLimit('read')
  @Get('Groups/:id')
  async getGroup(@Req() req: ScimRequest, @Param('id') id: string) {
    return toGroupResource(
      await this.groups.get(req.scim.tenantId, id),
      baseUrlOf(req),
    );
  }

  @PublicRoute(PUBLIC_REASON)
  @RateLimit('write')
  @Post('Groups')
  async createGroup(@Req() req: ScimRequest, @Body() body: unknown) {
    const outcome = await this.groups.create(req.scim.tenantId, body);

    await this.recordGroup(req, outcome);

    return toGroupResource(outcome.row, baseUrlOf(req));
  }

  @PublicRoute(PUBLIC_REASON)
  @RateLimit('write')
  @Put('Groups/:id')
  @HttpCode(200)
  async replaceGroup(
    @Req() req: ScimRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const outcome = await this.groups.replace(req.scim.tenantId, id, body);

    await this.recordGroup(req, outcome);

    return toGroupResource(outcome.row, baseUrlOf(req));
  }

  @PublicRoute(PUBLIC_REASON)
  @RateLimit('write')
  @Patch('Groups/:id')
  async patchGroup(
    @Req() req: ScimRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const outcome = await this.groups.patch(req.scim.tenantId, id, body);

    await this.recordGroup(req, outcome);

    return toGroupResource(outcome.row, baseUrlOf(req));
  }

  @PublicRoute(PUBLIC_REASON)
  @RateLimit('write')
  @Delete('Groups/:id')
  @HttpCode(204)
  async deleteGroup(@Req() req: ScimRequest, @Param('id') id: string) {
    await this.recordGroup(
      req,
      await this.groups.remove(req.scim.tenantId, id),
    );
  }

  private async writeUser(
    req: ScimRequest,
    outcome: Awaited<ReturnType<ScimUsersService['replace']>>,
  ) {
    await this.activity.record(req.scim.tenantId, {
      resource: 'user',
      action: outcome.action,
      resourceId: outcome.row.id,
      detail: outcome.row.email,
    });

    return toUserResource(outcome.row, baseUrlOf(req));
  }

  private recordGroup(
    req: ScimRequest,
    outcome: Awaited<ReturnType<ScimGroupsService['remove']>>,
  ): Promise<void> {
    return this.activity.record(req.scim.tenantId, {
      resource: 'group',
      action: outcome.action,
      resourceId: outcome.row.id,
      detail: outcome.row.name,
    });
  }
}
