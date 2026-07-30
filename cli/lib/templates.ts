import type { ResourceContext } from './resource-context';
import {
  fakerValueFor,
  prismaTypeFor,
  sampleValueFor,
  tsTypeFor,
  zodOutputTypeFor,
  zodTypeFor,
} from './field-types';

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
import { CapabilitiesService } from '../../technical/capabilities/capabilities.service';
import {
  resolveCapability,
  resolveCollectionCapability,
} from '../../technical/capabilities/resolve-capability';
import type { PolicyCheck } from '../../technical/capabilities/capability-check';
import {
  CapabilityDecision,
  CapabilitySubject,
} from '../../technical/capabilities/capabilities.types';

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
) => (record ? resolveCapability('${ctx.permissions.update}', subject, record) : { allowed: false });

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
import { PRISMA_CLIENT } from '../../technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '../../technical/prisma/prisma.client';
import type { RecordLoader } from '../../technical/capabilities/capability-check';
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

  return `import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, ${ctx.pascalName} } from '@prisma/client';
import { PRISMA_CLIENT } from '../../technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '../../technical/prisma/prisma.client';
import { CapabilitySubject } from '../../technical/capabilities/capabilities.types';
import { SignalService } from '../../technical/signal/signal.service';
import { buildTextSearchWhere } from '../../technical/search/text-search';
import { TenantContextStorage } from '../../technical/tenancy/tenant-context';
import { Create${ctx.pascalName}Input, Update${ctx.pascalName}Input } from './${ctx.kebabName}.dto';

const SEARCHABLE_FIELDS = [${searchableFields.map((name) => `'${name}'`).join(', ')}] as const;

export interface ${ctx.pascalName}SearchOptions {
  withTrashed?: boolean;
  onlyTrashed?: boolean;
  sort?: { field: string; direction: 'asc' | 'desc' };
  filters?: Record<string, string>;
  search?: string;
  limit?: number;
}

export const ${ctx.pascalName.toUpperCase()}_SIGNAL_CHANNEL = '${ctx.camelName}';

@Injectable()
export class ${ctx.pascalName}Service {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
    private readonly signal: SignalService,
  ) {}

  private notify() {
    this.signal.publish(
      \`\${TenantContextStorage.getTenantId()}:\${${ctx.pascalName.toUpperCase()}_SIGNAL_CHANNEL}\`,
    );
  }

  async search(options: ${ctx.pascalName}SearchOptions = {}) {
    const trashedWhere = options.onlyTrashed
      ? { deletedAt: { not: null } }
      : options.withTrashed
        ? {}
        : { deletedAt: null };

    return this.prisma.${ctx.camelName}.findMany({
      where: {
        ...trashedWhere,
        ...options.filters,
        ...buildTextSearchWhere(options.search, SEARCHABLE_FIELDS),
      },
      orderBy: options.sort
        ? { [options.sort.field]: options.sort.direction }
        : { createdAt: 'desc' },
      take: options.limit,
    });
  }

  async create(subject: CapabilitySubject, data: Create${ctx.pascalName}Input) {
    const record = await this.prisma.${ctx.camelName}.create({
      // tenantId is injected by the tenant-scoping Prisma extension, invisible to callers by design.
      data: {
        ...data,
        ownerId: subject.id,
      } as unknown as Prisma.${ctx.pascalName}CreateInput,
    });
    this.notify();
    return record;
  }

  async update(record: ${ctx.pascalName}, data: Update${ctx.pascalName}Input) {
    const updated = await this.prisma.${ctx.camelName}.update({ where: { id: record.id }, data });
    this.notify();
    return updated;
  }

  async softDelete(record: ${ctx.pascalName}) {
    const updated = await this.prisma.${ctx.camelName}.update({
      where: { id: record.id },
      data: { deletedAt: new Date() },
    });
    this.notify();
    return updated;
  }

  async restore(record: ${ctx.pascalName}) {
    const updated = await this.prisma.${ctx.camelName}.update({
      where: { id: record.id },
      data: { deletedAt: null },
    });
    this.notify();
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
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { ${ctx.pascalName} } from '@prisma/client';
import { SessionGuard } from '../../technical/auth/session.guard';
import type { RequestWithUser } from '../../technical/auth/session.guard';
import { CapabilitiesGuard } from '../../technical/capabilities/capabilities.guard';
import {
  Capability,
  LoadRecordWith,
} from '../../technical/capabilities/capability.decorator';
import { ok } from '../../technical/http/envelope';
import { parseListQuery } from '../../technical/http/list-query';
import { ZodValidationPipe } from '../../technical/validation/zod-validation.pipe';
import { create${ctx.pascalName}Schema, update${ctx.pascalName}Schema } from './${ctx.kebabName}.dto';
import type { Create${ctx.pascalName}Input, Update${ctx.pascalName}Input } from './${ctx.kebabName}.dto';
import {
  canCreate${ctx.pascalName},
  canDelete${ctx.pascalName},
  canUpdate${ctx.pascalName},
  canView${ctx.pascalName},
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

@Controller('${ctx.pluralKebabName}')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class ${ctx.pascalName}Controller {
  constructor(
    private readonly ${ctx.camelName}s: ${ctx.pascalName}Service,
    private readonly policy: ${ctx.pascalName}Policy,
  ) {}

  @Get()
  async search(
    @Req() req: RequestWithUser,
    @Query() rawQuery: Record<string, string>,
  ) {
    const { include } = rawQuery;
    const query = parseListQuery(rawQuery, {
      sorts: [${ctx.sorts.map((field) => `'${field}'`).join(', ')}],
      filters: [${ctx.filters.map((field) => `'${field}'`).join(', ')}],
      limits: [${ctx.pagination.limits.join(', ')}],
      defaultLimit: ${ctx.pagination.default},
    });

    const records = await this.${ctx.camelName}s.search(query);

    if (include !== 'capabilities') {
      return ok(records.map(to${ctx.pascalName}View), {
        channels: [${ctx.pascalName.toUpperCase()}_SIGNAL_CHANNEL],
      });
    }

    const subject = { id: req.user.id, teamIds: [] };

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

  @Get(':id')
  @Capability(canView${ctx.pascalName})
  @LoadRecordWith(${ctx.pascalName.toUpperCase()}_VISIBLE_RECORD_LOADER)
  findOne(@Req() req: RequestWith${ctx.pascalName}) {
    return ok(to${ctx.pascalName}View(req.record));
  }

  @Post()
  @Capability(canCreate${ctx.pascalName})
  async create(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(create${ctx.pascalName}Schema)) body: Create${ctx.pascalName}Input,
  ) {
    const subject = { id: req.user.id, teamIds: [] };
    return ok(to${ctx.pascalName}View(await this.${ctx.camelName}s.create(subject, body)));
  }

  @Patch(':id')
  @Capability(canUpdate${ctx.pascalName})
  @LoadRecordWith(${ctx.pascalName.toUpperCase()}_RECORD_LOADER)
  async update(
    @Req() req: RequestWith${ctx.pascalName},
    @Body(new ZodValidationPipe(update${ctx.pascalName}Schema)) body: Update${ctx.pascalName}Input,
  ) {
    return ok(to${ctx.pascalName}View(await this.${ctx.camelName}s.update(req.record, body)));
  }

  @Delete(':id')
  @Capability(canDelete${ctx.pascalName})
  @LoadRecordWith(${ctx.pascalName.toUpperCase()}_RECORD_LOADER)
  async remove(@Req() req: RequestWith${ctx.pascalName}) {
    return ok(to${ctx.pascalName}View(await this.${ctx.camelName}s.softDelete(req.record)));
  }

  @Post(':id/restore')
  @Capability(canUpdate${ctx.pascalName})
  @LoadRecordWith(${ctx.pascalName.toUpperCase()}_RECORD_LOADER)
  async restore(@Req() req: RequestWith${ctx.pascalName}) {
    return ok(to${ctx.pascalName}View(await this.${ctx.camelName}s.restore(req.record)));
  }
}
`;
}

export function moduleFile(ctx: ResourceContext): string {
  return `import { Module } from '@nestjs/common';
import { AuthModule } from '../../technical/auth/auth.module';
import { CapabilitiesService } from '../../technical/capabilities/capabilities.service';
import { PrismaModule } from '../../technical/prisma/prisma.module';
import { SignalModule } from '../../technical/signal/signal.module';
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
  imports: [PrismaModule, AuthModule, SignalModule],
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

export function specFile(ctx: ResourceContext): string {
  const requiredFields = ctx.fields.filter((field) => !field.optional);
  const createBody =
    requiredFields.length > 0
      ? `{ ${requiredFields.map((field) => `${field.name}: ${sampleValueFor(field)}`).join(', ')} }`
      : '{}';

  return `import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../app.module';
import { env } from '../../technical/config/env';
import { registerAndLogin } from '../../technical/testing/register-and-login';

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
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('creates a record owned by the current user, scoped to the current tenant', async () => {
    const response = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send(${createBody})
      .expect(201);

    expect(
      (response.body as { data: { tenantId: string } }).data.tenantId,
    ).toBe('default');
  });

  it('returns a real 403 when someone other than the owner tries to update it', async () => {
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

  it('soft-deletes then restores a record', async () => {
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

  it('never lets a different tenant see this tenant records', async () => {
    const outsider = await registerAndLogin(app);
    await prisma.user.update({
      where: { email: outsider.email },
      data: { tenantId: \`tenant-\${randomUUID()}\` },
    });

    const response = await request(app.getHttpServer())
      .get('/${ctx.pluralKebabName}')
      .set('Authorization', \`Bearer \${outsider.token}\`)
      .expect(200);

    expect((response.body as { data: unknown[] }).data).toHaveLength(0);
  });
});
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
  ownerId: z.string(),
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
  ownerId: string;
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
    ownerId: overrides.ownerId,
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
  ownerId   String
${customFieldLines}
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  owner User @relation(fields: [ownerId], references: [id])

  @@index([tenantId])
}
`;
}
