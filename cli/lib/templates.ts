import type { ResourceContext } from './resource-context';
import {
  fakerValueFor,
  graphqlTypeFor,
  prismaTypeFor,
  sampleValueFor,
  tsTypeFor,
  zodOutputTypeFor,
  zodTypeFor,
} from './field-types';

/**
 * A resource is owned by a team as soon as one of its presets says so, and only
 * then does the create path have a team to stamp on the record.
 */
function ownedByTeam(ctx: ResourceContext): boolean {
  return Object.values(ctx.permissions).includes('team');
}

function fieldLines(ctx: ResourceContext, indent: string): string {
  return ctx.fields
    .map((field) => `${indent}${field.name}: ${zodTypeFor(field)},`)
    .join('\n');
}

export function dtoFile(ctx: ResourceContext): string {
  return `import { z } from 'zod';

export const create${ctx.pascalName}Schema = z.object({
${fieldLines(ctx, '  ')}
});
export type Create${ctx.pascalName}Input = z.infer<typeof create${ctx.pascalName}Schema>;

export const update${ctx.pascalName}Schema = create${ctx.pascalName}Schema.partial();
export type Update${ctx.pascalName}Input = z.infer<typeof update${ctx.pascalName}Schema>;
`;
}

export function policyFile(ctx: ResourceContext): string {
  return `import { Injectable } from '@nestjs/common';
import { CapabilitiesService } from '#technical/capabilities/capabilities.service';
import {
  resolveCapability,
  resolveCollectionCapability,
} from '#technical/capabilities/resolve-capability';
import type { PolicyCheck } from '#technical/capabilities/capability-check';
import {
  CapabilityDecision,
  CapabilitySubject,
} from '#technical/capabilities/capabilities.types';

export interface ${ctx.pascalName}RecordLike {
  ownerId: string;
}

export const canCreate${ctx.pascalName}: PolicyCheck = (subject) =>
  resolveCollectionCapability('${ctx.permissions.create}', subject);

export const canUpdate${ctx.pascalName}: PolicyCheck<${ctx.pascalName}RecordLike> = (
  subject,
  record,
) => (record ? resolveCapability('${ctx.permissions.update}', subject, record) : { allowed: false });

export const canDelete${ctx.pascalName}: PolicyCheck<${ctx.pascalName}RecordLike> = (
  subject,
  record,
) => (record ? resolveCapability('${ctx.permissions.delete}', subject, record) : { allowed: false });

export const canView${ctx.pascalName}: PolicyCheck<${ctx.pascalName}RecordLike> = (
  subject,
  record,
) => (record ? resolveCapability('${ctx.permissions.view}', subject, record) : { allowed: false });

// Same preset as canView${ctx.pascalName}: whoever may read one record may ask for the
// collection, and scopeWhereFor narrows that collection to the very same rows.
export const canViewAny${ctx.pascalName}: PolicyCheck = (subject) =>
  resolveCollectionCapability('${ctx.permissions.view}', subject);

// Listing the bin is a moderation move, so it follows the delete preset rather
// than the read one.
export const canListTrashed${ctx.pascalName}: PolicyCheck = (subject) =>
  resolveCollectionCapability('${ctx.permissions.delete}', subject);

@Injectable()
export class ${ctx.pascalName}Policy {
  constructor(private readonly capabilities: CapabilitiesService) {}

  recordCapabilities(
    subject: CapabilitySubject,
    record: ${ctx.pascalName}RecordLike,
  ): Record<'update' | 'delete', CapabilityDecision> {
    return {
      update: this.capabilities.resolve('${ctx.permissions.update}', subject, record),
      delete: this.capabilities.resolve('${ctx.permissions.delete}', subject, record),
    };
  }

  metaCapabilities(
    subject: CapabilitySubject,
  ): Record<'create', CapabilityDecision> {
    return {
      create: canCreate${ctx.pascalName}(subject),
    };
  }
}
`;
}

export function recordLoaderFile(ctx: ResourceContext): string {
  return `import { Inject, Injectable } from '@nestjs/common';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import type { RecordLoader } from '#technical/capabilities/capability-check';
import type { ${ctx.pascalName}RecordLike } from './${ctx.kebabName}.policy';

export const ${ctx.pascalName.toUpperCase()}_RECORD_LOADER = Symbol(
  '${ctx.pascalName.toUpperCase()}_RECORD_LOADER',
);
export const ${ctx.pascalName.toUpperCase()}_VISIBLE_RECORD_LOADER = Symbol(
  '${ctx.pascalName.toUpperCase()}_VISIBLE_RECORD_LOADER',
);

// Update/delete/restore all need to find a record regardless of its
// soft-delete state (restore specifically targets trashed rows).
@Injectable()
export class ${ctx.pascalName}RecordLoader
  implements RecordLoader<${ctx.pascalName}RecordLike>
{
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async load(id: string) {
    return this.prisma.${ctx.camelName}.findUnique({ where: { id } });
  }
}

// Plain reads must not resurface a soft-deleted record as if it still existed.
@Injectable()
export class ${ctx.pascalName}VisibleRecordLoader
  implements RecordLoader<${ctx.pascalName}RecordLike>
{
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async load(id: string) {
    const record = await this.prisma.${ctx.camelName}.findUnique({ where: { id } });
    return record && !record.deletedAt ? record : null;
  }
}
`;
}

export function serviceFile(ctx: ResourceContext): string {
  const searchableFields = ctx.fields
    .filter((field) => field.type === 'string')
    .map((field) => field.name);

  return `import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma, ${ctx.pascalName} } from '@prisma/client';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { CapabilitySubject } from '#technical/capabilities/capabilities.types';
import { scopeWhereFor } from '#technical/capabilities/scope-where';${ownedByTeam(ctx) ? `\nimport { NoCurrentTeamException } from '#technical/errors/no-current-team.exception';` : ''}
import { SignalService } from '#technical/signal/signal.service';
import { SearchEngineRegistry } from '#technical/search/search-engine.registry';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { Create${ctx.pascalName}Input, Update${ctx.pascalName}Input } from './${ctx.kebabName}.dto';

const SEARCHABLE_FIELDS = [${searchableFields.map((name) => `'${name}'`).join(', ')}] as const;
const SEARCH_COLLECTION = '${ctx.kebabName}';

export interface ${ctx.pascalName}SearchOptions {
  withTrashed?: boolean;
  onlyTrashed?: boolean;
  sort?: { field: string; direction: 'asc' | 'desc' };
  filters?: Record<string, string>;
  search?: string;
  searchEngine?: string;
  limit?: number;
}

export const ${ctx.pascalName.toUpperCase()}_SIGNAL_CHANNEL = '${ctx.camelName}';

@Injectable()
export class ${ctx.pascalName}Service {
  private readonly logger = new Logger(${ctx.pascalName}Service.name);

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
    private readonly signal: SignalService,
    private readonly searchEngines: SearchEngineRegistry,
  ) {}

  private notify() {
    void this.signal.publish(
      \`\${TenantContextStorage.getTenantId()}:\${${ctx.pascalName.toUpperCase()}_SIGNAL_CHANNEL}\`,
    );
  }

  // A search engine that is down must not turn into a failed write: the
  // Prisma call above this already committed, so the record is durable
  // either way. Losing the index update for one record is recoverable
  // (hery search:reindex backfills it); returning a 500 for a write that
  // actually succeeded is not. Every declared non-Prisma engine gets synced,
  // not just one -- search[engine] lets a later request read through any of
  // them, so a write has to reach all of them, and one engine being down
  // must not stop the others from getting the update.
  private async syncSearchIndex(record: ${ctx.pascalName}) {
    for (const driver of this.searchEngines.externalDrivers) {
      try {
        if (record.deletedAt) {
          await driver.remove(SEARCH_COLLECTION, record.id, record.tenantId);
          continue;
        }

        const document = Object.fromEntries(
          SEARCHABLE_FIELDS.map((field) => [field, record[field]]),
        );
        await driver.index(
          SEARCH_COLLECTION,
          record.id,
          document,
          record.tenantId,
        );
      } catch (error) {
        this.logger.warn(
          \`search index out of sync for \${SEARCH_COLLECTION}:\${record.id}: \${(error as Error).message}\`,
        );
      }
    }
  }

  async search(
    subject: CapabilitySubject,
    options: ${ctx.pascalName}SearchOptions = {},
  ) {
    const trashedWhere = options.onlyTrashed
      ? { deletedAt: { not: null } }
      : options.withTrashed
        ? {}
        : { deletedAt: null };

    const searchWhere = options.search
      ? {
          id: {
            in: await this.searchEngines
              .resolve(options.searchEngine ?? this.searchEngines.defaultKeyword)
              .search(
                SEARCH_COLLECTION,
                options.search,
                SEARCHABLE_FIELDS,
                TenantContextStorage.getTenantId(),
              ),
          },
        }
      : undefined;

    // The scope clause sits in its own AND branch so a declared filter can
    // never widen it back, whatever the caller passes in the query string.
    return this.prisma.${ctx.camelName}.findMany({
      where: {
        AND: [
          scopeWhereFor('${ctx.permissions.view}', subject),
          trashedWhere,
          { ...options.filters, ...searchWhere },
        ],
      },
      orderBy: options.sort
        ? { [options.sort.field]: options.sort.direction }
        : { createdAt: 'desc' },
      take: options.limit,
    });
  }

  async create(subject: CapabilitySubject, data: Create${ctx.pascalName}Input) {
${
  ownedByTeam(ctx)
    ? `    if (!subject.currentTeamId) {
      throw new NoCurrentTeamException();
    }

`
    : ''
}    const record = await this.prisma.${ctx.camelName}.create({
      // tenantId is injected by the tenant-scoping Prisma extension, invisible to callers by design.
      data: {
        ...data,
        ownerId: subject.id,${ownedByTeam(ctx) ? `\n        // The team comes from the session, never from the request body, so a\n        // caller cannot file a record into a team it does not belong to.\n        teamId: subject.currentTeamId,` : ''}
      } as unknown as Prisma.${ctx.pascalName}CreateInput,
    });
    this.notify();
    await this.syncSearchIndex(record);
    return record;
  }

  async update(record: ${ctx.pascalName}, data: Update${ctx.pascalName}Input) {
    const updated = await this.prisma.${ctx.camelName}.update({ where: { id: record.id }, data });
    this.notify();
    await this.syncSearchIndex(updated);
    return updated;
  }

  async softDelete(record: ${ctx.pascalName}) {
    const updated = await this.prisma.${ctx.camelName}.update({
      where: { id: record.id },
      data: { deletedAt: new Date() },
    });
    this.notify();
    await this.syncSearchIndex(updated);
    return updated;
  }

  async restore(record: ${ctx.pascalName}) {
    const updated = await this.prisma.${ctx.camelName}.update({
      where: { id: record.id },
      data: { deletedAt: null },
    });
    this.notify();
    await this.syncSearchIndex(updated);
    return updated;
  }
}
`;
}

export function controllerFile(ctx: ResourceContext): string {
  return `import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { ${ctx.pascalName} } from '@prisma/client';
import { z } from 'zod';
import { SessionGuard } from '#technical/auth/session.guard';
import type { RequestWithUser } from '#technical/auth/session.guard';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { subjectOf } from '#technical/capabilities/subject';
import {
  Capability,
  LoadRecordWith,
} from '#technical/capabilities/capability.decorator';
import { CapabilityForbiddenException } from '#technical/errors/capability-forbidden.exception';
import { ok } from '#technical/http/envelope';
import { parseSearchRequest, searchRequestSchema } from '#technical/http/list-query';
import type { SearchRequestBody } from '#technical/http/list-query';
import { ZodValidationPipe } from '#technical/validation/zod-validation.pipe';
import { create${ctx.pascalName}Schema, update${ctx.pascalName}Schema } from './${ctx.kebabName}.dto';
import type { Create${ctx.pascalName}Input, Update${ctx.pascalName}Input } from './${ctx.kebabName}.dto';
import {
  canCreate${ctx.pascalName},
  canDelete${ctx.pascalName},
  canListTrashed${ctx.pascalName},
  canUpdate${ctx.pascalName},
  canView${ctx.pascalName},
  canViewAny${ctx.pascalName},
  ${ctx.pascalName}Policy,
} from './${ctx.kebabName}.policy';
import {
  ${ctx.pascalName.toUpperCase()}_SIGNAL_CHANNEL,
  ${ctx.pascalName}Service,
} from './${ctx.kebabName}.service';
import {
  ${ctx.pascalName.toUpperCase()}_RECORD_LOADER,
  ${ctx.pascalName.toUpperCase()}_VISIBLE_RECORD_LOADER,
} from './${ctx.kebabName}-record.loader';
import { to${ctx.pascalName}View } from './${ctx.kebabName}.view';

type RequestWith${ctx.pascalName} = RequestWithUser & { record: ${ctx.pascalName} };

// Computed once at module load, not per request: the blueprint's shape never
// changes at runtime, and the Zod schemas already own the create/update
// contract, so their JSON Schema is the rules a frontend needs -- reflected
// straight off the DTO rather than duplicated by hand.
const ${ctx.pascalName.toUpperCase()}_DESCRIBE = {
  fields: [
${ctx.fields.map((field) => `    { name: '${field.name}', type: '${field.type}', optional: ${field.optional} },`).join('\n')}
  ],
  sorts: [${ctx.sorts.map((field) => `'${field}'`).join(', ')}],
  filters: [${ctx.filters.map((field) => `'${field}'`).join(', ')}],
  limits: [${ctx.pagination.limits.join(', ')}],
  defaultLimit: ${ctx.pagination.default},
  rules: {
    create: z.toJSONSchema(create${ctx.pascalName}Schema),
    update: z.toJSONSchema(update${ctx.pascalName}Schema),
  },
};

@Controller('${ctx.pluralKebabName}')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class ${ctx.pascalName}Controller {
  constructor(
    private readonly ${ctx.camelName}s: ${ctx.pascalName}Service,
    private readonly policy: ${ctx.pascalName}Policy,
  ) {}

  @Post('search')
  @HttpCode(200)
  @Capability(canViewAny${ctx.pascalName})
  async search(
    @Req() req: RequestWithUser,
    @Query('include') include: string | undefined,
    @Body(new ZodValidationPipe(searchRequestSchema)) body: SearchRequestBody,
  ) {
    const query = parseSearchRequest(body, {
      sorts: [${ctx.sorts.map((field) => `'${field}'`).join(', ')}],
      filters: [${ctx.filters.map((field) => `'${field}'`).join(', ')}],
      limits: [${ctx.pagination.limits.join(', ')}],
      defaultLimit: ${ctx.pagination.default},
    });
    const subject = subjectOf(req.user);

    if (query.withTrashed || query.onlyTrashed) {
      const trashedDecision = canListTrashed${ctx.pascalName}(subject);

      if (!trashedDecision.allowed) {
        throw new CapabilityForbiddenException(trashedDecision);
      }
    }

    const records = await this.${ctx.camelName}s.search(subject, query);

    if (include !== 'capabilities') {
      return ok(records.map(to${ctx.pascalName}View), {
        channels: [${ctx.pascalName.toUpperCase()}_SIGNAL_CHANNEL],
      });
    }

    return ok(
      records.map((record) => ({
        ...to${ctx.pascalName}View(record),
        capabilities: this.policy.recordCapabilities(subject, record),
      })),
      {
        capabilities: this.policy.metaCapabilities(subject),
        channels: [${ctx.pascalName.toUpperCase()}_SIGNAL_CHANNEL],
      },
    );
  }

  // Registered ahead of :id -- Nest matches routes in declaration order, so
  // a static segment after the dynamic one would be swallowed as an id.
  @Get('describe')
  @Capability(canViewAny${ctx.pascalName})
  describe() {
    return ok(${ctx.pascalName.toUpperCase()}_DESCRIBE);
  }

  @Get(':id')
  @Capability(canView${ctx.pascalName})
  @LoadRecordWith(${ctx.pascalName.toUpperCase()}_VISIBLE_RECORD_LOADER, '${ctx.kebabName}')
  findOne(@Req() req: RequestWith${ctx.pascalName}) {
    return ok(to${ctx.pascalName}View(req.record));
  }

  @Post()
  @Capability(canCreate${ctx.pascalName})
  async create(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(create${ctx.pascalName}Schema)) body: Create${ctx.pascalName}Input,
  ) {
    const subject = subjectOf(req.user);
    return ok(to${ctx.pascalName}View(await this.${ctx.camelName}s.create(subject, body)));
  }

  @Patch(':id')
  @Capability(canUpdate${ctx.pascalName})
  @LoadRecordWith(${ctx.pascalName.toUpperCase()}_RECORD_LOADER, '${ctx.kebabName}')
  async update(
    @Req() req: RequestWith${ctx.pascalName},
    @Body(new ZodValidationPipe(update${ctx.pascalName}Schema)) body: Update${ctx.pascalName}Input,
  ) {
    return ok(to${ctx.pascalName}View(await this.${ctx.camelName}s.update(req.record, body)));
  }

  @Delete(':id')
  @Capability(canDelete${ctx.pascalName})
  @LoadRecordWith(${ctx.pascalName.toUpperCase()}_RECORD_LOADER, '${ctx.kebabName}')
  async remove(@Req() req: RequestWith${ctx.pascalName}) {
    return ok(to${ctx.pascalName}View(await this.${ctx.camelName}s.softDelete(req.record)));
  }

  @Post(':id/restore')
  @Capability(canUpdate${ctx.pascalName})
  @LoadRecordWith(${ctx.pascalName.toUpperCase()}_RECORD_LOADER, '${ctx.kebabName}')
  async restore(@Req() req: RequestWith${ctx.pascalName}) {
    return ok(to${ctx.pascalName}View(await this.${ctx.camelName}s.restore(req.record)));
  }
}
`;
}

export function moduleFile(ctx: ResourceContext): string {
  return `import { Module } from '@nestjs/common';
import { AuthModule } from '#technical/auth/auth.module';
import { CapabilitiesService } from '#technical/capabilities/capabilities.service';
import { PrismaModule } from '#technical/prisma/prisma.module';
import { SearchModule } from '#technical/search/search.module';
import { SignalModule } from '#technical/signal/signal.module';
import { ${ctx.pascalName}Controller } from './${ctx.kebabName}.controller';
import { ${ctx.pascalName}Policy } from './${ctx.kebabName}.policy';
import { ${ctx.pascalName}Service } from './${ctx.kebabName}.service';
import {
  ${ctx.pascalName.toUpperCase()}_RECORD_LOADER,
  ${ctx.pascalName.toUpperCase()}_VISIBLE_RECORD_LOADER,
  ${ctx.pascalName}RecordLoader,
  ${ctx.pascalName}VisibleRecordLoader,
} from './${ctx.kebabName}-record.loader';

@Module({
  imports: [PrismaModule, AuthModule, SearchModule, SignalModule],
  controllers: [${ctx.pascalName}Controller],
  providers: [
    ${ctx.pascalName}Service,
    ${ctx.pascalName}Policy,
    CapabilitiesService,
    { provide: ${ctx.pascalName.toUpperCase()}_RECORD_LOADER, useClass: ${ctx.pascalName}RecordLoader },
    {
      provide: ${ctx.pascalName.toUpperCase()}_VISIBLE_RECORD_LOADER,
      useClass: ${ctx.pascalName}VisibleRecordLoader,
    },
  ],
})
export class ${ctx.pascalName}Module {}
`;
}

export function resolverFile(ctx: ResourceContext): string {
  // A hidden field governs output, so it is absent from the ObjectType the same
  // way the view strips it from every REST response. GraphQL cannot serve a
  // field its type never declared, which is what makes this the boundary rather
  // than the resolver bodies below.
  const objectFields = ctx.fields
    .filter((field) => !field.hidden)
    .map(
      (field) =>
        `  @Field(() => ${graphqlTypeFor(field)}${field.optional ? ', { nullable: true }' : ''})\n  declare ${field.name}${field.optional ? '?' : ''}: ${tsTypeFor(field)};`,
    )
    .join('\n\n');

  // Every field, hidden ones included -- hidden governs the read side
  // (objectFields above), not what a caller may set on create. Filtering
  // to required fields left every optional column unsettable at creation,
  // and an @InputType with no fields at all when a blueprint had none.
  const createInputFields = ctx.fields
    .map(
      (field) =>
        `  @Field(() => ${graphqlTypeFor(field)}${field.optional ? ', { nullable: true }' : ''})\n  declare ${field.name}${field.optional ? '?' : ''}: ${tsTypeFor(field)};`,
    )
    .join('\n\n');

  const updateInputFields = ctx.fields
    .map(
      (field) =>
        `  @Field(() => ${graphqlTypeFor(field)}, { nullable: true })\n  declare ${field.name}?: ${tsTypeFor(field)};`,
    )
    .join('\n\n');

  // Named conditionally because the convention check refuses a template that
  // imports what it does not use, and only a blueprint carrying that field type
  // makes graphqlTypeFor emit the matching scalar. The inputs keep every field,
  // hidden ones included, so a hidden int still needs Int.
  const graphqlImports = [
    'Args',
    'Field',
    ...(ctx.fields.some((field) => field.type === 'datetime')
      ? ['GraphQLISODateTime']
      : []),
    'ID',
    'InputType',
    ...(ctx.fields.some((field) => field.type === 'int') ? ['Int'] : []),
    'Mutation',
    'ObjectType',
    'Query',
    'Resolver',
  ]
    .map((name) => `  ${name},`)
    .join('\n');

  return `import { Inject, UseGuards } from '@nestjs/common';
import {
${graphqlImports}
} from '@nestjs/graphql';
import { GqlSessionGuard } from '#technical/auth/gql-session.guard';
import type { GqlRequestWithUser } from '#technical/auth/gql-session.guard';
import { CurrentGqlRequest } from '#technical/auth/current-gql-request.decorator';
import { subjectOf } from '#technical/capabilities/subject';
import { CapabilityForbiddenException } from '#technical/errors/capability-forbidden.exception';
import { RecordNotFoundException } from '#technical/errors/record-not-found.exception';
import {
  canCreate${ctx.pascalName},
  canDelete${ctx.pascalName},
  canUpdate${ctx.pascalName},
  canView${ctx.pascalName},
  canViewAny${ctx.pascalName},
} from './${ctx.kebabName}.policy';
import { ${ctx.pascalName}Service } from './${ctx.kebabName}.service';
import {
  ${ctx.pascalName.toUpperCase()}_RECORD_LOADER,
  ${ctx.pascalName.toUpperCase()}_VISIBLE_RECORD_LOADER,
} from './${ctx.kebabName}-record.loader';
import type { ${ctx.pascalName}RecordLoader } from './${ctx.kebabName}-record.loader';
import { to${ctx.pascalName}View } from './${ctx.kebabName}.view';

@ObjectType('${ctx.pascalName}')
export class ${ctx.pascalName}Type {
  @Field(() => ID)
  declare id: string;

${objectFields}
}

@InputType()
export class Create${ctx.pascalName}Input {
${createInputFields}
}

@InputType()
export class Update${ctx.pascalName}Input {
${updateInputFields}
}

@Resolver(() => ${ctx.pascalName}Type)
@UseGuards(GqlSessionGuard)
export class ${ctx.pascalName}Resolver {
  constructor(
    private readonly ${ctx.camelName}s: ${ctx.pascalName}Service,
    @Inject(${ctx.pascalName.toUpperCase()}_VISIBLE_RECORD_LOADER)
    private readonly visibleLoader: ${ctx.pascalName}RecordLoader,
    @Inject(${ctx.pascalName.toUpperCase()}_RECORD_LOADER)
    private readonly loader: ${ctx.pascalName}RecordLoader,
  ) {}

  @Query(() => [${ctx.pascalName}Type], { name: '${ctx.pluralCamelName}' })
  async search(@CurrentGqlRequest() req: GqlRequestWithUser) {
    const subject = subjectOf(req.user);
    const decision = canViewAny${ctx.pascalName}(subject);
    if (!decision.allowed) {
      throw new CapabilityForbiddenException();
    }

    return (
      await this.${ctx.camelName}s.search(subject, {
        limit: ${ctx.pagination.default},
      })
    ).map(to${ctx.pascalName}View);
  }

  @Query(() => ${ctx.pascalName}Type, { name: '${ctx.camelName}' })
  async findOne(
    @Args('id', { type: () => ID }) id: string,
    @CurrentGqlRequest() req: GqlRequestWithUser,
  ) {
    const record = await this.visibleLoader.load(id);
    if (!record) {
      throw new RecordNotFoundException('${ctx.pascalName}');
    }

    const subject = subjectOf(req.user);
    const decision = canView${ctx.pascalName}(subject, record);
    if (!decision.allowed) {
      throw new CapabilityForbiddenException();
    }

    return to${ctx.pascalName}View(record);
  }

  @Mutation(() => ${ctx.pascalName}Type, { name: 'create${ctx.pascalName}' })
  async create(
    @Args('input') input: Create${ctx.pascalName}Input,
    @CurrentGqlRequest() req: GqlRequestWithUser,
  ) {
    const subject = subjectOf(req.user);
    const decision = canCreate${ctx.pascalName}(subject);
    if (!decision.allowed) {
      throw new CapabilityForbiddenException();
    }

    return to${ctx.pascalName}View(
      await this.${ctx.camelName}s.create(subject, input),
    );
  }

  @Mutation(() => ${ctx.pascalName}Type, { name: 'update${ctx.pascalName}' })
  async update(
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: Update${ctx.pascalName}Input,
    @CurrentGqlRequest() req: GqlRequestWithUser,
  ) {
    const record = await this.loader.load(id);
    if (!record) {
      throw new RecordNotFoundException('${ctx.pascalName}');
    }

    const subject = subjectOf(req.user);
    const decision = canUpdate${ctx.pascalName}(subject, record);
    if (!decision.allowed) {
      throw new CapabilityForbiddenException();
    }

    return to${ctx.pascalName}View(
      await this.${ctx.camelName}s.update(record, input),
    );
  }

  @Mutation(() => ${ctx.pascalName}Type, { name: 'remove${ctx.pascalName}' })
  async remove(
    @Args('id', { type: () => ID }) id: string,
    @CurrentGqlRequest() req: GqlRequestWithUser,
  ) {
    const record = await this.loader.load(id);
    if (!record) {
      throw new RecordNotFoundException('${ctx.pascalName}');
    }

    const subject = subjectOf(req.user);
    const decision = canDelete${ctx.pascalName}(subject, record);
    if (!decision.allowed) {
      throw new CapabilityForbiddenException();
    }

    return to${ctx.pascalName}View(await this.${ctx.camelName}s.softDelete(record));
  }
}
`;
}

export function mcpToolsFile(ctx: ResourceContext): string {
  return `import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Inject, Injectable } from '@nestjs/common';
import type { CapabilitySubject } from '#technical/capabilities/capabilities.types';
import type { McpToolRegistrar } from '#technical/mcp/mcp-tool-registrar';
import { create${ctx.pascalName}Schema, update${ctx.pascalName}Schema } from './${ctx.kebabName}.dto';
import {
  canCreate${ctx.pascalName},
  canDelete${ctx.pascalName},
  canUpdate${ctx.pascalName},
  canView${ctx.pascalName},
  canViewAny${ctx.pascalName},
} from './${ctx.kebabName}.policy';
import { ${ctx.pascalName}Service } from './${ctx.kebabName}.service';
import {
  ${ctx.pascalName.toUpperCase()}_RECORD_LOADER,
  ${ctx.pascalName.toUpperCase()}_VISIBLE_RECORD_LOADER,
} from './${ctx.kebabName}-record.loader';
import type { ${ctx.pascalName}RecordLoader } from './${ctx.kebabName}-record.loader';
import { to${ctx.pascalName}View } from './${ctx.kebabName}.view';

function textResult(payload: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
  };
}

function deniedResult() {
  return textResult({ error: 'capability denied' });
}

@Injectable()
export class ${ctx.pascalName}McpToolRegistrar implements McpToolRegistrar {
  constructor(
    private readonly ${ctx.camelName}s: ${ctx.pascalName}Service,
    @Inject(${ctx.pascalName.toUpperCase()}_RECORD_LOADER)
    private readonly loader: ${ctx.pascalName}RecordLoader,
    @Inject(${ctx.pascalName.toUpperCase()}_VISIBLE_RECORD_LOADER)
    private readonly visibleLoader: ${ctx.pascalName}RecordLoader,
  ) {}

  register(server: McpServer, subject: CapabilitySubject): void {
    server.registerTool(
      'search_${ctx.kebabName}',
      {
        description: 'Search ${ctx.pluralKebabName}, scoped to the current tenant and caller',
        inputSchema: {},
      },
      async () => {
        const decision = canViewAny${ctx.pascalName}(subject);
        if (!decision.allowed) {
          return deniedResult();
        }

        const records = await this.${ctx.camelName}s.search(subject, {
          limit: ${ctx.pagination.default},
        });
        return textResult(records.map(to${ctx.pascalName}View));
      },
    );

    server.registerTool(
      'get_${ctx.kebabName}',
      {
        description: 'Get a single ${ctx.kebabName} by id',
        inputSchema: { id: z.string() },
      },
      async ({ id }) => {
        const record = await this.visibleLoader.load(id);
        if (!record) {
          return textResult({ error: 'not found' });
        }

        const decision = canView${ctx.pascalName}(subject, record);
        if (!decision.allowed) {
          return deniedResult();
        }

        return textResult(to${ctx.pascalName}View(record));
      },
    );

    server.registerTool(
      'create_${ctx.kebabName}',
      {
        description: 'Create a ${ctx.kebabName}',
        inputSchema: create${ctx.pascalName}Schema.shape,
      },
      async (input) => {
        const decision = canCreate${ctx.pascalName}(subject);
        if (!decision.allowed) {
          return deniedResult();
        }

        const record = await this.${ctx.camelName}s.create(subject, input);
        return textResult(to${ctx.pascalName}View(record));
      },
    );

    server.registerTool(
      'update_${ctx.kebabName}',
      {
        description: 'Update a ${ctx.kebabName} by id',
        inputSchema: { id: z.string(), ...update${ctx.pascalName}Schema.shape },
      },
      async ({ id, ...input }) => {
        const record = await this.loader.load(id);
        if (!record) {
          return textResult({ error: 'not found' });
        }

        const decision = canUpdate${ctx.pascalName}(subject, record);
        if (!decision.allowed) {
          return deniedResult();
        }

        const updated = await this.${ctx.camelName}s.update(record, input);
        return textResult(to${ctx.pascalName}View(updated));
      },
    );

    server.registerTool(
      'remove_${ctx.kebabName}',
      {
        description: 'Soft-delete a ${ctx.kebabName} by id',
        inputSchema: { id: z.string() },
      },
      async ({ id }) => {
        const record = await this.loader.load(id);
        if (!record) {
          return textResult({ error: 'not found' });
        }

        const decision = canDelete${ctx.pascalName}(subject, record);
        if (!decision.allowed) {
          return deniedResult();
        }

        const removed = await this.${ctx.camelName}s.softDelete(record);
        return textResult(to${ctx.pascalName}View(removed));
      },
    );
  }
}
`;
}

export function streamControllerFile(ctx: ResourceContext): string {
  return `import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { ${ctx.pascalName} } from '@prisma/client';
import type { RequestWithUser } from '#technical/auth/session.guard';
import { SessionGuard } from '#technical/auth/session.guard';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import {
  Capability,
  LoadRecordWith,
} from '#technical/capabilities/capability.decorator';
import { ok } from '#technical/http/envelope';
import { StreamService } from '#modules/stream/stream.service';
import { canUpdate${ctx.pascalName}, canView${ctx.pascalName} } from './${ctx.kebabName}.policy';
import {
  ${ctx.pascalName.toUpperCase()}_RECORD_LOADER,
  ${ctx.pascalName.toUpperCase()}_VISIBLE_RECORD_LOADER,
} from './${ctx.kebabName}-record.loader';

type RequestWith${ctx.pascalName} = RequestWithUser & { record: ${ctx.pascalName} };

function roomFor(id: string): string {
  return '${ctx.kebabName}:' + id;
}

@Controller('${ctx.pluralKebabName}/:id/stream')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class ${ctx.pascalName}StreamController {
  constructor(private readonly stream: StreamService) {}

  @Post('publish-token')
  @Capability(canUpdate${ctx.pascalName})
  @LoadRecordWith(${ctx.pascalName.toUpperCase()}_RECORD_LOADER, '${ctx.kebabName}')
  async publishToken(@Req() req: RequestWith${ctx.pascalName}) {
    const room = roomFor(req.record.id);
    await this.stream.ensureRoom(room);
    const token = await this.stream.publishToken(room, req.user.id);
    return ok({ room, token });
  }

  @Post('viewer-token')
  @Capability(canView${ctx.pascalName})
  @LoadRecordWith(${ctx.pascalName.toUpperCase()}_VISIBLE_RECORD_LOADER, '${ctx.kebabName}')
  async viewerToken(@Req() req: RequestWith${ctx.pascalName}) {
    const room = roomFor(req.record.id);
    const token = await this.stream.viewerToken(room, req.user.id);
    return ok({ room, token });
  }
}
`;
}

export function liveGatewayFile(ctx: ResourceContext): string {
  return `import { Inject, UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { AUTH_PROVIDER } from '#technical/auth/auth.types';
import type { AuthProvider } from '#technical/auth/auth.types';
import { subjectOf } from '#technical/capabilities/subject';
import {
  authenticateLiveSocket,
  LiveAuthGuard,
} from '#modules/live/live-auth.guard';
import type { LiveSocket } from '#modules/live/live-auth.guard';
import { withTenant } from '#modules/live/with-tenant';
import { canUpdate${ctx.pascalName}, canView${ctx.pascalName} } from './${ctx.kebabName}.policy';
import {
  ${ctx.pascalName.toUpperCase()}_VISIBLE_RECORD_LOADER,
} from './${ctx.kebabName}-record.loader';
import type { ${ctx.pascalName}RecordLoader } from './${ctx.kebabName}-record.loader';

function room(id: string): string {
  return '${ctx.kebabName}:' + id;
}

@WebSocketGateway({ namespace: '/live/${ctx.kebabName}' })
@UseGuards(LiveAuthGuard)
export class ${ctx.pascalName}LiveGateway implements OnGatewayConnection {
  constructor(
    @Inject(${ctx.pascalName.toUpperCase()}_VISIBLE_RECORD_LOADER)
    private readonly visibleLoader: ${ctx.pascalName}RecordLoader,
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProvider,
  ) {}

  async handleConnection(client: LiveSocket) {
    const authenticated = await authenticateLiveSocket(
      client,
      this.authProvider,
    );

    if (!authenticated) {
      client.disconnect(true);
    }
  }

  @SubscribeMessage('join')
  join(@ConnectedSocket() client: LiveSocket, @MessageBody() body: { id: string }) {
    return withTenant(client, async () => {
      const record = await this.visibleLoader.load(body.id);
      if (!record) {
        return { error: 'not found' };
      }

      const subject = subjectOf(client.data.user);
      const decision = canView${ctx.pascalName}(subject, record);
      if (!decision.allowed) {
        return { error: 'capability denied' };
      }

      await client.join(room(body.id));
      return { joined: body.id };
    });
  }

  @SubscribeMessage('leave')
  async leave(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: { id: string },
  ) {
    await client.leave(room(body.id));
    return { left: body.id };
  }

  @SubscribeMessage('message')
  message(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: { id: string; text: string },
  ) {
    return withTenant(client, async () => {
      const record = await this.visibleLoader.load(body.id);
      if (!record) {
        return { error: 'not found' };
      }

      const subject = subjectOf(client.data.user);
      const decision = canUpdate${ctx.pascalName}(subject, record);
      if (!decision.allowed) {
        return { error: 'capability denied' };
      }

      client.to(room(body.id)).emit('message', {
        from: client.data.user.id,
        text: body.text,
        at: Date.now(),
      });
      return { sent: true };
    });
  }
}
`;
}

// The collection route and the detail route answer the same question with two
// different mechanisms, so each preset gets the test that proves they agree.
function scopeParityTest(ctx: ResourceContext, createBody: string): string {
  if (ctx.permissions.view === 'own' || ctx.permissions.view === 'team') {
    return `  it('keeps a record out of the list for anyone who cannot open it directly', async () => {
    const created = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send(${createBody})
      .expect(201);

    const recordId = (created.body as { data: { id: string } }).data.id;

    await request(app.getHttpServer())
      .get(\`/${ctx.pluralKebabName}/\${recordId}\`)
      .set('Authorization', \`Bearer \${strangerToken}\`)
      .expect(403);

    const list = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/search')
      .set('Authorization', \`Bearer \${strangerToken}\`)
      .send({})
      .expect(200);

    expect(
      (list.body as { data: { id: string }[] }).data.map((record) => record.id),
    ).not.toContain(recordId);
  });`;
  }

  if (ctx.permissions.view === 'all') {
    return `  it('lists a record to anyone who can also open it directly', async () => {
    const created = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send(${createBody})
      .expect(201);

    const recordId = (created.body as { data: { id: string } }).data.id;

    await request(app.getHttpServer())
      .get(\`/${ctx.pluralKebabName}/\${recordId}\`)
      .set('Authorization', \`Bearer \${strangerToken}\`)
      .expect(200);

    const list = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/search')
      .set('Authorization', \`Bearer \${strangerToken}\`)
      .send({})
      .expect(200);

    expect(
      (list.body as { data: { id: string }[] }).data.map((record) => record.id),
    ).toContain(recordId);
  });`;
  }

  return `  it('refuses the collection route outright, matching the view preset', async () => {
    await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/search')
      .set('Authorization', \`Bearer \${strangerToken}\`)
      .send({})
      .expect(403);
  });`;
}

// canListTrashed derives from the delete preset (resolveCollectionCapability),
// not the view preset, so this branches on ctx.permissions.delete rather than
// mirroring scopeParityTest's condition.
function trashParityTest(ctx: ResourceContext, createBody: string): string {
  if (ctx.permissions.delete === 'own' || ctx.permissions.delete === 'team') {
    return `  it('keeps a trashed record out of the bin of anyone who cannot open it', async () => {
    const created = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send(${createBody})
      .expect(201);

    const recordId = (created.body as { data: { id: string } }).data.id;

    await request(app.getHttpServer())
      .delete(\`/${ctx.pluralKebabName}/\${recordId}\`)
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .expect(200);

    const bin = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/search')
      .set('Authorization', \`Bearer \${strangerToken}\`)
      .send({ onlyTrashed: true })
      .expect(200);

    expect(
      (bin.body as { data: { id: string }[] }).data.map((record) => record.id),
    ).not.toContain(recordId);
  });`;
  }

  if (ctx.permissions.delete === 'all') {
    return `  it('lists a trashed record to anyone who can also list the trash', async () => {
    const created = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send(${createBody})
      .expect(201);

    const recordId = (created.body as { data: { id: string } }).data.id;

    await request(app.getHttpServer())
      .delete(\`/${ctx.pluralKebabName}/\${recordId}\`)
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .expect(200);

    const bin = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/search')
      .set('Authorization', \`Bearer \${strangerToken}\`)
      .send({ onlyTrashed: true })
      .expect(200);

    expect(
      (bin.body as { data: { id: string }[] }).data.map((record) => record.id),
    ).toContain(recordId);
  });`;
  }

  return `  it('refuses to list the trash outright, matching the delete preset', async () => {
    await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/search')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ onlyTrashed: true })
      .expect(403);
  });`;
}

export function specFile(ctx: ResourceContext): string {
  const requiredFields = ctx.fields.filter((field) => !field.optional);
  const createBody =
    requiredFields.length > 0
      ? `{ ${requiredFields.map((field) => `${field.name}: ${sampleValueFor(field)}`).join(', ')} }`
      : '{}';
  const primarySearchField = ctx.fields.find(
    (field) => field.type === 'string' && !field.hidden,
  );

  // A preset of 'none' means the kernel returns { allowed: false } for
  // everyone, the owner fixture included -- so any test that first has to
  // create, update or delete a record to set up its own assertion can never
  // get past that setup step under the matching preset. resolveCapability
  // also excludes 'none' from CapabilityScope, which is what made the old
  // hardcoded `{ allowed: true, scope: 'none' }` unsatisfiable by construction.
  const canCreateAny = ctx.permissions.create !== 'none';
  const canUpdateAny = ctx.permissions.update !== 'none';
  const canDeleteAny = ctx.permissions.delete !== 'none';

  return `import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { env } from '#technical/config/env';
import { registerAndLogin } from '#devtools/testing/register-and-login';

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

describe('${ctx.pascalName} resource', () => {
  let app: INestApplication<App>;
  let ownerToken: string;
  let strangerToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    ownerToken = (await registerAndLogin(app)).token;
    strangerToken = (await registerAndLogin(app)).token;
${
  ownedByTeam(ctx)
    ? `
    // Distinct teams, not the same one: the parity test below proves a
    // stranger is refused, and that only holds if the two fixtures do not
    // already share a team. The session is re-resolved from the database on
    // every request, so the tokens created above pick up the membership
    // without being reissued.
    await request(app.getHttpServer())
      .post('/teams')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ name: 'Owner Team' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/teams')
      .set('Authorization', \`Bearer \${strangerToken}\`)
      .send({ name: 'Stranger Team' })
      .expect(201);
`
    : ''
}  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

${
  canCreateAny
    ? `  it('creates a record owned by the current user, scoped to the current tenant', async () => {
    const response = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send(${createBody})
      .expect(201);

    expect(
      (response.body as { data: { tenantId: string } }).data.tenantId,
    ).toBe('default');
  });

`
    : ''
}  it('describes its fields and create/update rules for a frontend to consume', async () => {
    const response = await request(app.getHttpServer())
      .get('/${ctx.pluralKebabName}/describe')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .expect(200);

    const body = response.body as {
      data: {
        fields: Array<{ name: string }>;
        limits: number[];
        rules: { create: { required?: string[] } };
      };
    };
    expect(body.data.fields.map((field) => field.name)).toEqual([
${ctx.fields.map((field) => `      '${field.name}',`).join('\n')}
    ]);
    expect(body.data.limits).toEqual([${ctx.pagination.limits.join(', ')}]);
${
  requiredFields.length > 0
    ? `    expect(body.data.rules.create.required).toEqual([${requiredFields.map((field) => `'${field.name}'`).join(', ')}]);`
    : ''
}
  });

${scopeParityTest(ctx, createBody)}

${trashParityTest(ctx, createBody)}

${
  canCreateAny && canUpdateAny
    ? `  it('lists records with resolved capabilities via ?include=capabilities', async () => {
    await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send(${createBody})
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/search?include=capabilities')
      .send({})
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .expect(200);

    const body = response.body as {
      data: Array<{ capabilities: { update: { allowed: boolean } } }>;
      meta: unknown;
    };
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0]?.capabilities.update.allowed).toBe(true);
    expect(body.meta).toEqual({
      capabilities: { create: { allowed: true, scope: '${ctx.permissions.create}' } },
      channels: ['${ctx.kebabName}'],
    });
  });

`
    : ''
}${
    canCreateAny
      ? `  it('returns a real 403 when someone other than the owner tries to update it', async () => {
    const created = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send(${createBody})
      .expect(201);

    const recordId = (created.body as { data: { id: string } }).data.id;

    await request(app.getHttpServer())
      .patch(\`/${ctx.pluralKebabName}/\${recordId}\`)
      .set('Authorization', \`Bearer \${strangerToken}\`)
      .send(${createBody})
      .expect(403);
  });

`
      : ''
  }${
    canCreateAny && canUpdateAny && canDeleteAny
      ? `  it('soft-deletes then restores a record', async () => {
    const created = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send(${createBody})
      .expect(201);

    const recordId = (created.body as { data: { id: string } }).data.id;

    await request(app.getHttpServer())
      .delete(\`/${ctx.pluralKebabName}/\${recordId}\`)
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .expect(200);

    await request(app.getHttpServer())
      .get(\`/${ctx.pluralKebabName}/\${recordId}\`)
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .expect(404);

    await request(app.getHttpServer())
      .post(\`/${ctx.pluralKebabName}/\${recordId}/restore\`)
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .expect(201);

    await request(app.getHttpServer())
      .get(\`/${ctx.pluralKebabName}/\${recordId}\`)
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .expect(200);
  });

`
      : ''
  }  it('never lets a different tenant see this tenant records', async () => {
    const outsider = await registerAndLogin(app);
    await prisma.user.update({
      where: { email: outsider.email },
      data: { tenantId: \`tenant-\${randomUUID()}\` },
    });

    const response = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/search')
      .set('Authorization', \`Bearer \${outsider.token}\`)
      .send({})
      .expect(200);

    expect((response.body as { data: unknown[] }).data).toHaveLength(0);
  });

  it('cannot be spoofed into another tenant via a client-supplied header', async () => {
    const response = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/search')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .set('x-tenant-id', \`tenant-\${randomUUID()}\`)
      .send({})
      .expect(200);

    expect(
      (response.body as { data: Array<{ tenantId: string }> }).data.every(
        (record) => record.tenantId === 'default',
      ),
    ).toBe(true);
  });
${
  primarySearchField
    ? `
  it('finds a record by text search through the explicitly named default engine', async () => {
    const created = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send(${createBody})
      .expect(201);

    const record = (created.body as { data: Record<string, unknown> }).data;
    const term = String(record.${primarySearchField.name});

    const found = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/search')
      .send({ search: { q: term, engine: 'prisma' } })
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .expect(200);

    expect(
      (found.body as { data: { id: string }[] }).data.map((r) => r.id),
    ).toContain(record.id);
  });

  it('rejects a search engine keyword hery.config.ts never declared', async () => {
    await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/search')
      .send({ search: { q: 'anything', engine: 'nonexistent' } })
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .expect(400);
  });
`
    : ''
}});
`;
}

export function viewFile(ctx: ResourceContext): string {
  const hiddenFields = ctx.fields.filter((field) => field.hidden);
  const visibleFields = ctx.fields.filter((field) => !field.hidden);

  const visibleFieldLines = visibleFields
    .map((field) => `  ${field.name}: ${zodOutputTypeFor(field)},`)
    .join('\n');

  const schema = `export const ${ctx.camelName}ViewSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  ownerId: z.string(),${ownedByTeam(ctx) ? `\n  teamId: z.string(),` : ''}
${visibleFieldLines}
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  deletedAt: z.coerce.date().nullable(),
});
export type ${ctx.pascalName}View = z.infer<typeof ${ctx.camelName}ViewSchema>;
`;

  if (hiddenFields.length === 0) {
    return `import { z } from 'zod';
import type { ${ctx.pascalName} } from '@prisma/client';

${schema}
export function to${ctx.pascalName}View(record: ${ctx.pascalName}): ${ctx.pascalName}View {
  return ${ctx.camelName}ViewSchema.parse(record);
}
`;
  }

  const hiddenNames = hiddenFields.map((field) => field.name).join(', ');

  return `import { z } from 'zod';
import type { ${ctx.pascalName} } from '@prisma/client';

${schema}
export function to${ctx.pascalName}View(record: ${ctx.pascalName}): ${ctx.pascalName}View {
  const { ${hiddenNames}, ...view } = record;
  return ${ctx.camelName}ViewSchema.parse(view);
}
`;
}

export function factoryFile(ctx: ResourceContext): string {
  const overrideLines = ctx.fields
    .map((field) => `  ${field.name}?: ${tsTypeFor(field)};`)
    .join('\n');

  const buildLines = ctx.fields
    .map(
      (field) =>
        `    ${field.name}: overrides.${field.name} ?? ${fakerValueFor(field)},`,
    )
    .join('\n');

  return `import { faker } from '@faker-js/faker';

export interface ${ctx.pascalName}FactoryOverrides {
  ownerId: string;${ownedByTeam(ctx) ? '\n  teamId: string;' : ''}
  tenantId?: string;
${overrideLines}
  trashed?: boolean;
}

export interface ${ctx.pascalName}FactoryOptions {
  count?: number;
}

function build${ctx.pascalName}(overrides: ${ctx.pascalName}FactoryOverrides) {
  return {
${buildLines}
    ownerId: overrides.ownerId,${ownedByTeam(ctx) ? '\n    teamId: overrides.teamId,' : ''}
    ...(overrides.tenantId ? { tenantId: overrides.tenantId } : {}),
    deletedAt: overrides.trashed ? new Date() : null,
  };
}

export function ${ctx.camelName}Factory(
  overrides: ${ctx.pascalName}FactoryOverrides,
): ReturnType<typeof build${ctx.pascalName}>;
export function ${ctx.camelName}Factory(
  overrides: ${ctx.pascalName}FactoryOverrides,
  options: Required<${ctx.pascalName}FactoryOptions>,
): ReturnType<typeof build${ctx.pascalName}>[];
export function ${ctx.camelName}Factory(
  overrides: ${ctx.pascalName}FactoryOverrides,
  options: ${ctx.pascalName}FactoryOptions = {},
) {
  if (options.count === undefined) {
    return build${ctx.pascalName}(overrides);
  }

  return Array.from({ length: options.count }, () => build${ctx.pascalName}(overrides));
}
`;
}

export function prismaModelBlock(ctx: ResourceContext): string {
  const customFieldLines = ctx.fields
    .map((field) => `  ${field.name} ${prismaTypeFor(field)}`)
    .join('\n');

  return `
model ${ctx.pascalName} {
  id        String    @id @default(cuid())
  tenantId  String
  ownerId   String${ownedByTeam(ctx) ? `\n  teamId    String` : ''}
${customFieldLines}
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  owner User @relation(fields: [ownerId], references: [id])${ownedByTeam(ctx) ? `\n  team  Team @relation(fields: [teamId], references: [id])` : ''}

  @@index([tenantId])
}
`;
}
