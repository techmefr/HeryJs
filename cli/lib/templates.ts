import type { ResourceContext } from './resource-context';
import {
  fakerValueFor,
  prismaTypeFor,
  sampleValueFor,
  tsTypeFor,
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
`;
}

export function serviceFile(ctx: ResourceContext): string {
  return `import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, ${ctx.pascalName} } from '@prisma/client';
import { PRISMA_CLIENT } from '../../technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '../../technical/prisma/prisma.client';
import { RecordNotFoundException } from '../../technical/errors/record-not-found.exception';
import { CapabilitySubject } from '../../technical/capabilities/capabilities.types';
import { Create${ctx.pascalName}Input, Update${ctx.pascalName}Input } from './${ctx.kebabName}.dto';

export interface ${ctx.pascalName}SearchOptions {
  withTrashed?: boolean;
  onlyTrashed?: boolean;
}

@Injectable()
export class ${ctx.pascalName}Service {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async search(options: ${ctx.pascalName}SearchOptions = {}) {
    const where = options.onlyTrashed
      ? { deletedAt: { not: null } }
      : options.withTrashed
        ? {}
        : { deletedAt: null };

    return this.prisma.${ctx.camelName}.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneOrFail(id: string) {
    const record = await this.prisma.${ctx.camelName}.findUnique({ where: { id } });

    if (!record || record.deletedAt) {
      throw new RecordNotFoundException('${ctx.camelName}');
    }

    return record;
  }

  create(subject: CapabilitySubject, data: Create${ctx.pascalName}Input) {
    return this.prisma.${ctx.camelName}.create({
      // tenantId is injected by the tenant-scoping Prisma extension, invisible to callers by design.
      data: {
        ...data,
        ownerId: subject.id,
      } as unknown as Prisma.${ctx.pascalName}CreateInput,
    });
  }

  update(record: ${ctx.pascalName}, data: Update${ctx.pascalName}Input) {
    return this.prisma.${ctx.camelName}.update({ where: { id: record.id }, data });
  }

  softDelete(record: ${ctx.pascalName}) {
    return this.prisma.${ctx.camelName}.update({
      where: { id: record.id },
      data: { deletedAt: new Date() },
    });
  }

  restore(record: ${ctx.pascalName}) {
    return this.prisma.${ctx.camelName}.update({
      where: { id: record.id },
      data: { deletedAt: null },
    });
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
  Param,
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
import { ZodValidationPipe } from '../../technical/validation/zod-validation.pipe';
import { create${ctx.pascalName}Schema, update${ctx.pascalName}Schema } from './${ctx.kebabName}.dto';
import type { Create${ctx.pascalName}Input, Update${ctx.pascalName}Input } from './${ctx.kebabName}.dto';
import {
  canCreate${ctx.pascalName},
  canDelete${ctx.pascalName},
  canUpdate${ctx.pascalName},
  ${ctx.pascalName}Policy,
} from './${ctx.kebabName}.policy';
import { ${ctx.pascalName}Service } from './${ctx.kebabName}.service';
import { ${ctx.pascalName.toUpperCase()}_RECORD_LOADER } from './${ctx.kebabName}-record.loader';

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
    @Query('include') include?: string,
    @Query('withTrashed') withTrashed?: string,
    @Query('onlyTrashed') onlyTrashed?: string,
  ) {
    const records = await this.${ctx.camelName}s.search({
      withTrashed: withTrashed === 'true',
      onlyTrashed: onlyTrashed === 'true',
    });

    if (include !== 'capabilities') {
      return ok(records);
    }

    const subject = { id: req.user.id, teamIds: [] };

    return ok(
      records.map((record) => ({
        ...record,
        capabilities: this.policy.recordCapabilities(subject, record),
      })),
      { capabilities: this.policy.metaCapabilities(subject) },
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return ok(await this.${ctx.camelName}s.findOneOrFail(id));
  }

  @Post()
  @Capability(canCreate${ctx.pascalName})
  async create(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(create${ctx.pascalName}Schema)) body: Create${ctx.pascalName}Input,
  ) {
    const subject = { id: req.user.id, teamIds: [] };
    return ok(await this.${ctx.camelName}s.create(subject, body));
  }

  @Patch(':id')
  @Capability(canUpdate${ctx.pascalName})
  @LoadRecordWith(${ctx.pascalName.toUpperCase()}_RECORD_LOADER)
  async update(
    @Req() req: RequestWith${ctx.pascalName},
    @Body(new ZodValidationPipe(update${ctx.pascalName}Schema)) body: Update${ctx.pascalName}Input,
  ) {
    return ok(await this.${ctx.camelName}s.update(req.record, body));
  }

  @Delete(':id')
  @Capability(canDelete${ctx.pascalName})
  @LoadRecordWith(${ctx.pascalName.toUpperCase()}_RECORD_LOADER)
  async remove(@Req() req: RequestWith${ctx.pascalName}) {
    return ok(await this.${ctx.camelName}s.softDelete(req.record));
  }

  @Post(':id/restore')
  @Capability(canUpdate${ctx.pascalName})
  @LoadRecordWith(${ctx.pascalName.toUpperCase()}_RECORD_LOADER)
  async restore(@Req() req: RequestWith${ctx.pascalName}) {
    return ok(await this.${ctx.camelName}s.restore(req.record));
  }
}
`;
}

export function moduleFile(ctx: ResourceContext): string {
  return `import { Module } from '@nestjs/common';
import { AuthModule } from '../../technical/auth/auth.module';
import { CapabilitiesService } from '../../technical/capabilities/capabilities.service';
import { PrismaModule } from '../../technical/prisma/prisma.module';
import { ${ctx.pascalName}Controller } from './${ctx.kebabName}.controller';
import { ${ctx.pascalName}Policy } from './${ctx.kebabName}.policy';
import { ${ctx.pascalName}Service } from './${ctx.kebabName}.service';
import {
  ${ctx.pascalName.toUpperCase()}_RECORD_LOADER,
  ${ctx.pascalName}RecordLoader,
} from './${ctx.kebabName}-record.loader';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [${ctx.pascalName}Controller],
  providers: [
    ${ctx.pascalName}Service,
    ${ctx.pascalName}Policy,
    CapabilitiesService,
    { provide: ${ctx.pascalName.toUpperCase()}_RECORD_LOADER, useClass: ${ctx.pascalName}RecordLoader },
  ],
})
export class ${ctx.pascalName}Module {}
`;
}

export function specFile(ctx: ResourceContext): string {
  const requiredField = ctx.fields.find((field) => !field.optional);
  const createBody = requiredField
    ? `{ ${requiredField.name}: ${sampleValueFor(requiredField)} }`
    : '{}';

  return `import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../app.module';

const TENANT_ID = \`tenant-\${randomUUID()}\`;

async function registerAndLogin(app: INestApplication<App>) {
  const email = \`\${randomUUID()}@example.test\`;
  const password = 'correct-horse-battery-staple';

  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password })
    .expect(201);

  const login = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password })
    .expect(201);

  return (login.body as { data: { token: string } }).data.token;
}

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

    ownerToken = await registerAndLogin(app);
    strangerToken = await registerAndLogin(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a record owned by the current user, scoped to the current tenant', async () => {
    const response = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .set('x-tenant-id', TENANT_ID)
      .send(${createBody})
      .expect(201);

    expect(
      (response.body as { data: { tenantId: string } }).data.tenantId,
    ).toBe(TENANT_ID);
  });

  it('returns a real 403 when someone other than the owner tries to update it', async () => {
    const created = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .set('x-tenant-id', TENANT_ID)
      .send(${createBody})
      .expect(201);

    const recordId = (created.body as { data: { id: string } }).data.id;

    await request(app.getHttpServer())
      .patch(\`/${ctx.pluralKebabName}/\${recordId}\`)
      .set('Authorization', \`Bearer \${strangerToken}\`)
      .set('x-tenant-id', TENANT_ID)
      .send(${createBody})
      .expect(403);
  });

  it('soft-deletes then restores a record', async () => {
    const created = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .set('x-tenant-id', TENANT_ID)
      .send(${createBody})
      .expect(201);

    const recordId = (created.body as { data: { id: string } }).data.id;

    await request(app.getHttpServer())
      .delete(\`/${ctx.pluralKebabName}/\${recordId}\`)
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .set('x-tenant-id', TENANT_ID)
      .expect(200);

    await request(app.getHttpServer())
      .get(\`/${ctx.pluralKebabName}/\${recordId}\`)
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .set('x-tenant-id', TENANT_ID)
      .expect(404);

    await request(app.getHttpServer())
      .post(\`/${ctx.pluralKebabName}/\${recordId}/restore\`)
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .set('x-tenant-id', TENANT_ID)
      .expect(201);

    await request(app.getHttpServer())
      .get(\`/${ctx.pluralKebabName}/\${recordId}\`)
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .set('x-tenant-id', TENANT_ID)
      .expect(200);
  });

  it('never lets a different tenant see this tenant records', async () => {
    const otherTenantId = \`tenant-\${randomUUID()}\`;

    const response = await request(app.getHttpServer())
      .get('/${ctx.pluralKebabName}')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .set('x-tenant-id', otherTenantId)
      .expect(200);

    expect((response.body as { data: unknown[] }).data).toHaveLength(0);
  });
});
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
