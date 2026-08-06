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
import { camelCase } from './naming';

/**
 * A resource is owned by a team as soon as one of its presets says so, and only
 * then does the create path have a team to stamp on the record.
 */
function ownedByTeam(ctx: ResourceContext): boolean {
  return Object.values(ctx.permissions).includes('team');
}

export function presetsFile(ctx: ResourceContext): string {
  return `import type { PermissionPreset } from '#technical/capabilities/capabilities.types';

/**
 * What the blueprint's permissions became. The blueprint itself is never read
 * at runtime, so this object is the single declaration of the four presets:
 * the detail route resolves one against a loaded record, the collection query
 * turns the same one into a where clause, and the view reports it to the
 * client. Every one of them reads this object rather than repeating a literal.
 *
 * That matters because the failure mode is silent. A preset tightened in the
 * policy and forgotten in the service produces a record the detail route
 * refuses and the list route hands out in full -- no error, just data that
 * should have been withheld. With one declaration there is no second place to
 * forget, and pnpm lint:scope-parity fails the build on any call that passes a
 * literal instead.
 */
export const ${ctx.screamingSnakeName}_PRESETS = {
  view: '${ctx.permissions.view}',
  create: '${ctx.permissions.create}',
  update: '${ctx.permissions.update}',
  delete: '${ctx.permissions.delete}',
} as const satisfies Record<
  'view' | 'create' | 'update' | 'delete',
  PermissionPreset
>;
`;
}

function pascalRelationName(relation: { relation: string }): string {
  return relation.relation[0]!.toUpperCase() + relation.relation.slice(1);
}

function fieldLines(ctx: ResourceContext, indent: string): string {
  return ctx.fields
    .map((field) => `${indent}${field.name}: ${zodTypeFor(field)},`)
    .join('\n');
}

function relationSchemaBlock(ctx: ResourceContext): string {
  if (ctx.relations.length === 0) {
    return '';
  }

  const fields = ctx.relations
    .map(
      (relation) =>
        `  ${relation.relation}: relationMutationSchema.optional(),`,
    )
    .join('\n');

  return `
// attach adds, detach removes, sync replaces the whole set in one call --
// never combined with attach/detach in the same request, since "replace with
// exactly this set" and "add/remove from whatever is there" are different
// intents that would otherwise race on the same pivot row.
const relationMutationSchema = z
  .object({
    attach: z.array(z.string()).optional(),
    detach: z.array(z.string()).optional(),
    sync: z.array(z.string()).optional(),
  })
  .refine(
    (input) => !input.sync || (!input.attach && !input.detach),
    { message: 'sync cannot be combined with attach or detach' },
  );
export type RelationMutationInput = z.infer<typeof relationMutationSchema>;

const update${ctx.pascalName}RelationsSchema = z.object({
${fields}
});
export type Update${ctx.pascalName}RelationsInput = z.infer<
  typeof update${ctx.pascalName}RelationsSchema
>;
`;
}

export function dtoFile(ctx: ResourceContext): string {
  const hasRelations = ctx.relations.length > 0;

  return `import { z } from 'zod';

export const create${ctx.pascalName}Schema = z.object({
${fieldLines(ctx, '  ')}
});
export type Create${ctx.pascalName}Input = z.infer<typeof create${ctx.pascalName}Schema>;

export const update${ctx.pascalName}Schema = create${ctx.pascalName}Schema.partial();
export type Update${ctx.pascalName}Input = z.infer<typeof update${ctx.pascalName}Schema>;
${relationSchemaBlock(ctx)}
// Every mutating verb separates the target (what it acts on) from the
// setting (how it acts) -- data/ids is always an array, even for a single
// record, so the response shape never has to differ between one and many.
export const create${ctx.pascalName}RequestSchema = z.object({
  data: z.array(create${ctx.pascalName}Schema),
});
export type Create${ctx.pascalName}RequestBody = z.infer<
  typeof create${ctx.pascalName}RequestSchema
>;

export const update${ctx.pascalName}RequestSchema = z.object({
  data: z.array(
    update${ctx.pascalName}Schema.extend({
      id: z.string(),${hasRelations ? `\n      relations: update${ctx.pascalName}RelationsSchema.optional(),` : ''}
    }),
  ),
});
export type Update${ctx.pascalName}RequestBody = z.infer<
  typeof update${ctx.pascalName}RequestSchema
>;

export const DELETE_MODES = ['soft', 'hard'] as const;
export type Delete${ctx.pascalName}Mode = (typeof DELETE_MODES)[number];

export const delete${ctx.pascalName}RequestSchema = z.object({
  ids: z.array(z.string()),
  mode: z.enum(DELETE_MODES).default('soft'),
});
export type Delete${ctx.pascalName}RequestBody = z.infer<
  typeof delete${ctx.pascalName}RequestSchema
>;

export const restore${ctx.pascalName}RequestSchema = z.object({
  ids: z.array(z.string()),
  // A short, scoped patch to reapply on restore -- not a second update, so
  // it reuses the update schema's own field whitelist rather than inventing
  // a narrower one.
  patch: update${ctx.pascalName}Schema.optional(),
});
export type Restore${ctx.pascalName}RequestBody = z.infer<
  typeof restore${ctx.pascalName}RequestSchema
>;
`;
}

function relationPolicyBlock(ctx: ResourceContext): string {
  return ctx.relations
    .map((relation) => {
      const pascalRelation = pascalRelationName(relation);
      return `
// Distinct from canUpdate${ctx.pascalName}, not an alias of it: being able to edit a
// ${ctx.camelName}'s own fields does not automatically mean being able to attach or
// detach whatever this relation points at -- see the relation capabilities
// doctrine. Both default to the same preset today, but each is its own
// PolicyCheck so one can diverge from update later without touching it.
export const canAttach${pascalRelation}To${ctx.pascalName}: PolicyCheck<${ctx.pascalName}RecordLike> = (
  subject,
  record,
) => (record ? resolveCapability(${ctx.screamingSnakeName}_PRESETS.update, subject, record) : { allowed: false });

export const canDetach${pascalRelation}From${ctx.pascalName}: PolicyCheck<${ctx.pascalName}RecordLike> = (
  subject,
  record,
) => (record ? resolveCapability(${ctx.screamingSnakeName}_PRESETS.update, subject, record) : { allowed: false });
`;
    })
    .join('');
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
import { ${ctx.screamingSnakeName}_PRESETS } from './${ctx.kebabName}.presets';

export interface ${ctx.pascalName}RecordLike {
  ownerId: string;
}

export const canCreate${ctx.pascalName}: PolicyCheck = (subject) =>
  resolveCollectionCapability(${ctx.screamingSnakeName}_PRESETS.create, subject);

export const canUpdate${ctx.pascalName}: PolicyCheck<${ctx.pascalName}RecordLike> = (
  subject,
  record,
) => (record ? resolveCapability(${ctx.screamingSnakeName}_PRESETS.update, subject, record) : { allowed: false });

// The outer gate on the bulk update route -- there is no single record yet
// to check against, so this is the same broad pass the collection search
// route takes, before canUpdate${ctx.pascalName} narrows per record inside the handler.
export const canUpdateAny${ctx.pascalName}: PolicyCheck = (subject) =>
  resolveCollectionCapability(${ctx.screamingSnakeName}_PRESETS.update, subject);
${relationPolicyBlock(ctx)}
export const canDelete${ctx.pascalName}: PolicyCheck<${ctx.pascalName}RecordLike> = (
  subject,
  record,
) => (record ? resolveCapability(${ctx.screamingSnakeName}_PRESETS.delete, subject, record) : { allowed: false });

// Same reasoning as canUpdateAny${ctx.pascalName}, for the bulk delete route.
export const canDeleteAny${ctx.pascalName}: PolicyCheck = (subject) =>
  resolveCollectionCapability(${ctx.screamingSnakeName}_PRESETS.delete, subject);

// Restore is the inverse of delete, not a kind of update -- whoever can
// delete a record decides whether it comes back, the same way
// canListTrashed${ctx.pascalName} already derives from the delete preset rather than
// the view preset. Its own capability rather than reusing canDelete${ctx.pascalName}
// so a route can diverge later (e.g. restore always requiring 'all' even on
// an 'own'-scoped delete preset).
export const canRestore${ctx.pascalName}: PolicyCheck<${ctx.pascalName}RecordLike> = (
  subject,
  record,
) => (record ? resolveCapability(${ctx.screamingSnakeName}_PRESETS.delete, subject, record) : { allowed: false });

export const canRestoreAny${ctx.pascalName}: PolicyCheck = (subject) =>
  resolveCollectionCapability(${ctx.screamingSnakeName}_PRESETS.delete, subject);

// Hard delete is not a scope on the delete preset -- own/team/all/none answer
// "whose records", not "how permanently". It is its own admin-only capability,
// checked in addition to (never instead of) the delete preset above.
export const canHardDelete${ctx.pascalName}: PolicyCheck = (subject) =>
  subject.role === 'admin' ? { allowed: true, scope: 'all' } : { allowed: false };

// Purge has no route today -- only the future admin decorator system reaches
// it -- but it is still gated by its own capability rather than reusing
// canHardDelete${ctx.pascalName}, because a route may one day expose it under rules
// stricter than "any admin" (e.g. a second admin's approval).
export const canPurge${ctx.pascalName}: PolicyCheck = (subject) =>
  subject.role === 'admin' ? { allowed: true, scope: 'all' } : { allowed: false };

export const canView${ctx.pascalName}: PolicyCheck<${ctx.pascalName}RecordLike> = (
  subject,
  record,
) => (record ? resolveCapability(${ctx.screamingSnakeName}_PRESETS.view, subject, record) : { allowed: false });

// Same preset as canView${ctx.pascalName}: whoever may read one record may ask for the
// collection, and scopeWhereFor narrows that collection to the very same rows.
export const canViewAny${ctx.pascalName}: PolicyCheck = (subject) =>
  resolveCollectionCapability(${ctx.screamingSnakeName}_PRESETS.view, subject);

// Listing the bin is a moderation move, so it follows the delete preset rather
// than the read one.
export const canListTrashed${ctx.pascalName}: PolicyCheck = (subject) =>
  resolveCollectionCapability(${ctx.screamingSnakeName}_PRESETS.delete, subject);

@Injectable()
export class ${ctx.pascalName}Policy {
  constructor(private readonly capabilities: CapabilitiesService) {}

  recordCapabilities(
    subject: CapabilitySubject,
    record: ${ctx.pascalName}RecordLike,
  ): Record<'update' | 'delete', CapabilityDecision> {
    return {
      update: this.capabilities.resolve(${ctx.screamingSnakeName}_PRESETS.update, subject, record),
      delete: this.capabilities.resolve(${ctx.screamingSnakeName}_PRESETS.delete, subject, record),
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

export const ${ctx.screamingSnakeName}_RECORD_LOADER = Symbol(
  '${ctx.screamingSnakeName}_RECORD_LOADER',
);
export const ${ctx.screamingSnakeName}_VISIBLE_RECORD_LOADER = Symbol(
  '${ctx.screamingSnakeName}_VISIBLE_RECORD_LOADER',
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
import { writeAuditLog } from '#technical/audit/audit-log';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { resolveRelationInstructions } from '#technical/http/relation-resolver';
import type { PrismaRelationClient } from '#technical/http/relation-resolver';
import type { RelationInstruction } from '#technical/http/list-query';${ctx.relations.length > 0 ? `\nimport { applyRelationMutation } from '#technical/http/relation-mutations';\nimport type { PivotDelegate } from '#technical/http/relation-mutations';` : ''}
import {
  Create${ctx.pascalName}Input,${ctx.relations.length > 0 ? `\n  RelationMutationInput,` : ''}
  Update${ctx.pascalName}Input,
} from './${ctx.kebabName}.dto';
import { ${ctx.screamingSnakeName}_PRESETS } from './${ctx.kebabName}.presets';

const SEARCHABLE_FIELDS = [${searchableFields.map((name) => `'${name}'`).join(', ')}] as const;
const SEARCH_COLLECTION = '${ctx.kebabName}';

export interface ${ctx.pascalName}SearchOptions {
  withTrashed?: boolean;
  onlyTrashed?: boolean;
  sorts?: { field: string; direction: 'asc' | 'desc' }[];
  where?: Record<string, unknown>;
  include?: Record<string, unknown>;
  relationInstructions?: RelationInstruction[];
  search?: string;
  searchEngine?: string;
  page?: number;
  limit?: number;
}

export const ${ctx.screamingSnakeName}_SIGNAL_CHANNEL = '${ctx.camelName}';

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
      \`\${TenantContextStorage.getTenantId()}:\${${ctx.screamingSnakeName}_SIGNAL_CHANNEL}\`,
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
    if (record.deletedAt) {
      await this.removeFromSearchIndex(record.id, record.tenantId);
      return;
    }

    for (const driver of this.searchEngines.externalDrivers) {
      try {
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

  // Shared by soft delete (via syncSearchIndex above) and hard delete: a
  // hard-deleted row has no updated record to read deletedAt off, only the
  // id and tenant it used to have.
  private async removeFromSearchIndex(id: string, tenantId: string) {
    for (const driver of this.searchEngines.externalDrivers) {
      try {
        await driver.remove(SEARCH_COLLECTION, id, tenantId);
      } catch (error) {
        this.logger.warn(
          \`search index out of sync for \${SEARCH_COLLECTION}:\${id}: \${(error as Error).message}\`,
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
    const where = {
      AND: [
        scopeWhereFor(${ctx.screamingSnakeName}_PRESETS.view, subject),
        trashedWhere,
        ...(options.where ? [options.where] : []),
        ...(searchWhere ? [searchWhere] : []),
      ],
    };

    const page = options.page ?? 1;
    const limit = options.limit;

    const [records, total] = await Promise.all([
      this.prisma.${ctx.camelName}.findMany({
        where,
        orderBy:
          options.sorts && options.sorts.length > 0
            ? options.sorts.map((sort) => ({ [sort.field]: sort.direction }))
            : { createdAt: 'desc' },
        skip: limit ? (page - 1) * limit : undefined,
        take: limit,
        include: options.include as Prisma.${ctx.pascalName}Include | undefined,
      }),
      this.prisma.${ctx.camelName}.count({ where }),
    ]);

    await resolveRelationInstructions(
      this.prisma as unknown as PrismaRelationClient,
      records,
      options.relationInstructions,
    );

    return { records, total };
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
${ctx.relations
  .map(
    (relation) => `
  async sync${pascalRelationName(relation)}(record: ${ctx.pascalName}, input: RelationMutationInput) {
    return applyRelationMutation(
      this.prisma.${relation.pivotDelegate} as unknown as PivotDelegate,
      '${relation.foreignKey}',
      '${relation.relatedKey}',
      record.id,
      input,
    );
  }
`,
  )
  .join('')}
  async softDelete(record: ${ctx.pascalName}) {
    const updated = await this.prisma.${ctx.camelName}.update({
      where: { id: record.id },
      data: { deletedAt: new Date() },
    });
    this.notify();
    await this.syncSearchIndex(updated);
    return updated;
  }

  async restore(record: ${ctx.pascalName}, patch?: Update${ctx.pascalName}Input) {
    const updated = await this.prisma.${ctx.camelName}.update({
      where: { id: record.id },
      data: { ...patch, deletedAt: null },
    });
    this.notify();
    await this.syncSearchIndex(updated);
    return updated;
  }

  // Distinct from softDelete: this removes the row rather than flagging it,
  // and is reached only once the caller already holds the separate hard-delete
  // capability. Runs on the same tenant-scoped client as every other write, so
  // the audit extension records it exactly like any other audited delete.
  async hardDelete(record: ${ctx.pascalName}) {
    await this.prisma.${ctx.camelName}.delete({ where: { id: record.id } });
    this.notify();
    await this.removeFromSearchIndex(record.id, record.tenantId);
  }

  // Distinct from hardDelete: purge is gated by its own capability rather than
  // the delete preset, and the audit entry is written before the row is gone
  // rather than relying on the tenant-scoped client's automatic after-the-fact
  // extension, because a purge is exactly the operation an audit trail exists
  // to prove happened even if the write that follows it never completes. That
  // ordering is why it deletes through the unscoped client -- writing the
  // entry by hand and letting the extension write a second one would fork the
  // chain -- so the tenant travels in the where clause instead: the boundary
  // still applies, it is simply stated rather than injected. A record from
  // another tenant was loaded through the scoped client and cannot reach here,
  // and if one ever did the delete would not match a row.
  async purge(record: ${ctx.pascalName}) {
    await writeAuditLog(authPrismaClient, {
      tenantId: record.tenantId,
      model: '${ctx.pascalName}',
      operation: 'purge',
      recordId: record.id,
      data: {},
      userId: TenantContextStorage.getUserId(),
      impersonatedBy: TenantContextStorage.getImpersonatedBy(),
    });
    await authPrismaClient.${ctx.camelName}.delete({
      where: { id: record.id, tenantId: record.tenantId },
    });
    this.notify();
    await this.removeFromSearchIndex(record.id, record.tenantId);
  }
}
`;
}

// Both the /describe payload and the search contract need the same relation
// allow-list rendered as an object literal, one entry per declared relation.
// The link fields (type/foreignKey/discriminator/childDelegate) are what lets
// the runtime resolve the relation at all; filters/sorts/selects (or fields,
// for aggregates) are the same client-facing allow-lists a plain filter/sort
// gets, just derived from the referenced resource's own blueprint instead of
// retyped here.
function relationLinkLiteral(
  link: {
    type: string;
    foreignKey: string;
    resource: string;
    discriminator?: string;
    discriminatorValue?: string;
  },
  indent: string,
): string {
  const discriminatorLines =
    link.discriminator !== undefined && link.discriminatorValue !== undefined
      ? `\n${indent}    discriminator: '${link.discriminator}',\n${indent}    discriminatorValue: '${link.discriminatorValue}',`
      : '';

  return `${indent}    type: '${link.type}',
${indent}    foreignKey: '${link.foreignKey}',${discriminatorLines}
${indent}    childDelegate: '${camelCase(link.resource)}',`;
}

function includesContractLiteral(ctx: ResourceContext, indent: string): string {
  if (ctx.includes.length === 0) return '{}';

  const entries = ctx.includes
    .map(
      (include) => `${indent}  ${include.relation}: {
${relationLinkLiteral(include, indent)}
${indent}    filters: [${include.filters.map((field) => `'${field}'`).join(', ')}],
${indent}    sorts: [${include.sorts.map((field) => `'${field}'`).join(', ')}],
${indent}    selects: [${include.selects.map((field) => `'${field}'`).join(', ')}],
${indent}  },`,
    )
    .join('\n');

  return `{\n${entries}\n${indent}}`;
}

function aggregatesContractLiteral(
  ctx: ResourceContext,
  indent: string,
): string {
  if (ctx.aggregates.length === 0) return '{}';

  const entries = ctx.aggregates
    .map(
      (aggregate) => `${indent}  ${aggregate.relation}: {
${relationLinkLiteral(aggregate, indent)}
${indent}    filters: [${aggregate.filters.map((field) => `'${field}'`).join(', ')}],
${indent}    fields: [${aggregate.fields.map((field) => `'${field}'`).join(', ')}],
${indent}  },`,
    )
    .join('\n');

  return `{\n${entries}\n${indent}}`;
}

export function controllerFile(ctx: ResourceContext): string {
  const selectableFields = [
    'id',
    'ownerId',
    ...(ownedByTeam(ctx) ? ['teamId'] : []),
    ...ctx.fields.filter((field) => !field.hidden).map((field) => field.name),
    'createdAt',
    'updatedAt',
    'deletedAt',
  ];

  return `import { Body, Controller, Get, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common';
import type { ${ctx.pascalName} } from '@prisma/client';
import { z } from 'zod';
import { SessionGuard } from '#technical/auth/session.guard';
import type { RequestWithUser } from '#technical/auth/session.guard';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { subjectOf } from '#technical/capabilities/subject';
import { Capability } from '#technical/capabilities/capability.decorator';
import { CapabilityForbiddenException } from '#technical/errors/capability-forbidden.exception';
import { RecordNotFoundException } from '#technical/errors/record-not-found.exception';
import { AlreadyRestoredException } from '#technical/errors/already-restored.exception';
import { resolveDomainError } from '#technical/errors/domain-exception.filter';
import type { ResolvedError } from '#technical/errors/domain-exception.filter';
import { ok } from '#technical/http/envelope';
import {
  parseSearchRequest,
  searchRequestSchema,
  withIncludesAndAggregates,
} from '#technical/http/list-query';
import type {
  ListQueryContract,
  SearchRequestBody,
} from '#technical/http/list-query';
import { ZodValidationPipe } from '#technical/validation/zod-validation.pipe';
import {
  create${ctx.pascalName}RequestSchema,
  create${ctx.pascalName}Schema,
  delete${ctx.pascalName}RequestSchema,
  restore${ctx.pascalName}RequestSchema,
  update${ctx.pascalName}RequestSchema,
  update${ctx.pascalName}Schema,
} from './${ctx.kebabName}.dto';
import type {
  Create${ctx.pascalName}RequestBody,
  Delete${ctx.pascalName}RequestBody,
  Restore${ctx.pascalName}RequestBody,
  Update${ctx.pascalName}RequestBody,
} from './${ctx.kebabName}.dto';
import {${ctx.relations
    .map(
      (relation) =>
        `\n  canAttach${pascalRelationName(relation)}To${ctx.pascalName},`,
    )
    .join('')}
  canCreate${ctx.pascalName},
  canDelete${ctx.pascalName},
  canDeleteAny${ctx.pascalName},${ctx.relations
    .map(
      (relation) =>
        `\n  canDetach${pascalRelationName(relation)}From${ctx.pascalName},`,
    )
    .join('')}
  canHardDelete${ctx.pascalName},
  canListTrashed${ctx.pascalName},
  canRestore${ctx.pascalName},
  canRestoreAny${ctx.pascalName},
  canUpdate${ctx.pascalName},
  canUpdateAny${ctx.pascalName},
  canViewAny${ctx.pascalName},
  ${ctx.pascalName}Policy,
} from './${ctx.kebabName}.policy';
import {
  ${ctx.screamingSnakeName}_SIGNAL_CHANNEL,
  ${ctx.pascalName}Service,
} from './${ctx.kebabName}.service';
import { ${ctx.screamingSnakeName}_RECORD_LOADER } from './${ctx.kebabName}-record.loader';
import type { ${ctx.pascalName}RecordLoader } from './${ctx.kebabName}-record.loader';
import { to${ctx.pascalName}View } from './${ctx.kebabName}.view';

// What the search route accepts, declared once. parseSearchRequest validates
// against this object and GET /describe publishes it, so the endpoint cannot
// advertise a contract it does not honour -- or honour one it never mentions.
// Two literals disagreed on id, which is filterable and used to be missing
// from describe.
const ${ctx.screamingSnakeName}_CONTRACT = {
  sorts: [${ctx.sorts.map((field) => `'${field}'`).join(', ')}],
  filters: ['id', ${ctx.filters.map((field) => `'${field}'`).join(', ')}],
  selects: [${selectableFields.map((field) => `'${field}'`).join(', ')}],
  includes: ${includesContractLiteral(ctx, '  ')},
  aggregates: ${aggregatesContractLiteral(ctx, '  ')},
  limits: [${ctx.pagination.limits.join(', ')}],
  defaultLimit: ${ctx.pagination.default},
} as const satisfies ListQueryContract;

// Computed once at module load, not per request: the blueprint's shape never
// changes at runtime, and the Zod schemas already own the create/update
// contract, so their JSON Schema is the rules a frontend needs -- reflected
// straight off the DTO rather than duplicated by hand.
const ${ctx.screamingSnakeName}_DESCRIBE = {
  fields: [
${ctx.fields.map((field) => `    { name: '${field.name}', type: '${field.type}', optional: ${field.optional} },`).join('\n')}
  ],
  ...${ctx.screamingSnakeName}_CONTRACT,
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
    @Inject(${ctx.screamingSnakeName}_RECORD_LOADER)
    private readonly loader: ${ctx.pascalName}RecordLoader,
  ) {}

  // Reused by update/delete/restore: each id is loaded and checked on its
  // own, and a missing record or a denied one becomes that id's entry in the
  // batch result rather than aborting every other id in the same request.
  private async loadAndAuthorize(
    ids: string[],
    subject: ReturnType<typeof subjectOf>,
    check: (subject: ReturnType<typeof subjectOf>, record: unknown) => { allowed: boolean },
  ) {
    const entries: Array<
      | { index: number; id: string; ok: true; record: ${ctx.pascalName} }
      | { index: number; id: string; ok: false; error: ResolvedError }
    > = [];

    for (const [index, id] of ids.entries()) {
      const record = await this.loader.load(id);

      if (!record) {
        entries.push({
          index,
          id,
          ok: false,
          error: resolveDomainError(new RecordNotFoundException('${ctx.kebabName}')),
        });
        continue;
      }

      const decision = check(subject, record);

      if (!decision.allowed) {
        entries.push({
          index,
          id,
          ok: false,
          error: resolveDomainError(new CapabilityForbiddenException(decision)),
        });
        continue;
      }

      entries.push({ index, id, ok: true, record });
    }

    return entries;
  }

  @Post('search')
  @HttpCode(200)
  @Capability(canViewAny${ctx.pascalName})
  async search(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(searchRequestSchema)) body: SearchRequestBody,
  ) {
    const query = parseSearchRequest(body, ${ctx.screamingSnakeName}_CONTRACT);
    const subject = subjectOf(req.user);

    if (query.withTrashed || query.onlyTrashed) {
      const trashedDecision = canListTrashed${ctx.pascalName}(subject);

      if (!trashedDecision.allowed) {
        throw new CapabilityForbiddenException(trashedDecision);
      }
    }

    const { records, total } = await this.${ctx.camelName}s.search(subject, query);
    const capabilities = body.capabilities ?? [];
    const select = query.select;
    const project = (view: Record<string, unknown>) =>
      select
        ? Object.fromEntries(
            Object.entries(view).filter(([key]) => key in select),
          )
        : view;
    const meta = {
      channels: [${ctx.screamingSnakeName}_SIGNAL_CHANNEL],
      page: query.page,
      limit: query.limit,
      total,
      last_page: Math.max(1, Math.ceil(total / query.limit)),
    };

    if (capabilities.length === 0) {
      return ok(
        records.map((record) =>
          withIncludesAndAggregates(project(to${ctx.pascalName}View(record)), record, query),
        ),
        meta,
      );
    }

    return ok(
      records.map((record) => {
        const resolved = this.policy.recordCapabilities(subject, record);
        return {
          ...withIncludesAndAggregates(project(to${ctx.pascalName}View(record)), record, query),
          capabilities: Object.fromEntries(
            Object.entries(resolved).filter(([key]) =>
              capabilities.includes(key),
            ),
          ),
        };
      }),
      {
        ...meta,
        capabilities: this.policy.metaCapabilities(subject),
      },
    );
  }

  @Get('describe')
  @Capability(canViewAny${ctx.pascalName})
  describe() {
    return ok(${ctx.screamingSnakeName}_DESCRIBE);
  }

  @Post('create')
  @Capability(canCreate${ctx.pascalName})
  async create(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(create${ctx.pascalName}RequestSchema))
    body: Create${ctx.pascalName}RequestBody,
  ) {
    const subject = subjectOf(req.user);
    const results = [];

    for (const [index, item] of body.data.entries()) {
      try {
        const created = await this.${ctx.camelName}s.create(subject, item);
        results.push({ index, status: 'ok' as const, data: to${ctx.pascalName}View(created) });
      } catch (error) {
        results.push({ index, status: 'error' as const, error: resolveDomainError(error) });
      }
    }

    return ok(results);
  }

  @Post('update')
  @Capability(canUpdateAny${ctx.pascalName})
  async update(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(update${ctx.pascalName}RequestSchema))
    body: Update${ctx.pascalName}RequestBody,
  ) {
    const subject = subjectOf(req.user);
    const loaded = await this.loadAndAuthorize(
      body.data.map((item) => item.id),
      subject,
      (s, record) => canUpdate${ctx.pascalName}(s, record as never),
    );

    const results = [];

    for (const [index, entry] of loaded.entries()) {
      if (!entry.ok) {
        results.push({ index, id: entry.id, status: 'error' as const, error: entry.error });
        continue;
      }

      const { id: _id,${ctx.relations.length > 0 ? ' relations,' : ''} ...data } = body.data[index]!;

      try {
        const updated = await this.${ctx.camelName}s.update(entry.record, data);
${
  ctx.relations.length === 0
    ? ''
    : `        const relationResults: Record<string, string[]> = {};

${ctx.relations
  .map((relation) => {
    const pascalRelation = pascalRelationName(relation);
    return `        if (relations?.${relation.relation}) {
          const { attach, detach, sync } = relations.${relation.relation};

          if ((attach && attach.length > 0) || sync) {
            const decision = canAttach${pascalRelation}To${ctx.pascalName}(subject, entry.record);
            if (!decision.allowed) {
              throw new CapabilityForbiddenException(decision);
            }
          }

          if ((detach && detach.length > 0) || sync) {
            const decision = canDetach${pascalRelation}From${ctx.pascalName}(subject, entry.record);
            if (!decision.allowed) {
              throw new CapabilityForbiddenException(decision);
            }
          }

          relationResults.${relation.relation} = await this.${ctx.camelName}s.sync${pascalRelation}(
            entry.record,
            relations.${relation.relation},
          );
        }

`;
  })
  .join('')}`
}        results.push({
          index,
          id: entry.id,
          status: 'ok' as const,
          data: { ...to${ctx.pascalName}View(updated)${ctx.relations.length > 0 ? ', ...relationResults' : ''} },
        });
      } catch (error) {
        results.push({ index, id: entry.id, status: 'error' as const, error: resolveDomainError(error) });
      }
    }

    return ok(results);
  }

  @Post('delete')
  @Capability(canDeleteAny${ctx.pascalName})
  async remove(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(delete${ctx.pascalName}RequestSchema))
    body: Delete${ctx.pascalName}RequestBody,
  ) {
    const subject = subjectOf(req.user);
    const loaded = await this.loadAndAuthorize(
      body.ids,
      subject,
      (s, record) => canDelete${ctx.pascalName}(s, record as never),
    );

    if (body.mode === 'hard') {
      const hardDecision = canHardDelete${ctx.pascalName}(subject);

      if (!hardDecision.allowed) {
        throw new CapabilityForbiddenException(hardDecision);
      }
    }

    const results = [];

    for (const [index, entry] of loaded.entries()) {
      if (!entry.ok) {
        results.push({ index, id: entry.id, status: 'error' as const, error: entry.error });
        continue;
      }

      try {
        if (body.mode === 'hard') {
          await this.${ctx.camelName}s.hardDelete(entry.record);
          results.push({ index, id: entry.id, status: 'ok' as const, data: null });
        } else {
          const removed = await this.${ctx.camelName}s.softDelete(entry.record);
          results.push({ index, id: entry.id, status: 'ok' as const, data: to${ctx.pascalName}View(removed) });
        }
      } catch (error) {
        results.push({ index, id: entry.id, status: 'error' as const, error: resolveDomainError(error) });
      }
    }

    return ok(results);
  }

  @Post('restore')
  @Capability(canRestoreAny${ctx.pascalName})
  async restore(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(restore${ctx.pascalName}RequestSchema))
    body: Restore${ctx.pascalName}RequestBody,
  ) {
    const subject = subjectOf(req.user);
    const loaded = await this.loadAndAuthorize(
      body.ids,
      subject,
      (s, record) => canRestore${ctx.pascalName}(s, record as never),
    );

    const results = [];

    for (const [index, entry] of loaded.entries()) {
      if (!entry.ok) {
        results.push({ index, id: entry.id, status: 'error' as const, error: entry.error });
        continue;
      }

      try {
        if (!entry.record.deletedAt) {
          throw new AlreadyRestoredException('${ctx.kebabName}');
        }

        const restored = await this.${ctx.camelName}s.restore(entry.record, body.patch);
        results.push({ index, id: entry.id, status: 'ok' as const, data: to${ctx.pascalName}View(restored) });
      } catch (error) {
        results.push({ index, id: entry.id, status: 'error' as const, error: resolveDomainError(error) });
      }
    }

    return ok(results);
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
  ${ctx.screamingSnakeName}_RECORD_LOADER,
  ${ctx.screamingSnakeName}_VISIBLE_RECORD_LOADER,
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
    { provide: ${ctx.screamingSnakeName}_RECORD_LOADER, useClass: ${ctx.pascalName}RecordLoader },
    {
      provide: ${ctx.screamingSnakeName}_VISIBLE_RECORD_LOADER,
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
  ${ctx.screamingSnakeName}_RECORD_LOADER,
  ${ctx.screamingSnakeName}_VISIBLE_RECORD_LOADER,
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
    @Inject(${ctx.screamingSnakeName}_VISIBLE_RECORD_LOADER)
    private readonly visibleLoader: ${ctx.pascalName}RecordLoader,
    @Inject(${ctx.screamingSnakeName}_RECORD_LOADER)
    private readonly loader: ${ctx.pascalName}RecordLoader,
  ) {}

  @Query(() => [${ctx.pascalName}Type], { name: '${ctx.pluralCamelName}' })
  async search(@CurrentGqlRequest() req: GqlRequestWithUser) {
    const subject = subjectOf(req.user);
    const decision = canViewAny${ctx.pascalName}(subject);
    if (!decision.allowed) {
      throw new CapabilityForbiddenException();
    }

    const { records } = await this.${ctx.camelName}s.search(subject, {
      limit: ${ctx.pagination.default},
    });

    return records.map(to${ctx.pascalName}View);
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
  ${ctx.screamingSnakeName}_RECORD_LOADER,
  ${ctx.screamingSnakeName}_VISIBLE_RECORD_LOADER,
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
    @Inject(${ctx.screamingSnakeName}_RECORD_LOADER)
    private readonly loader: ${ctx.pascalName}RecordLoader,
    @Inject(${ctx.screamingSnakeName}_VISIBLE_RECORD_LOADER)
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

        const { records } = await this.${ctx.camelName}s.search(subject, {
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
  ${ctx.screamingSnakeName}_RECORD_LOADER,
  ${ctx.screamingSnakeName}_VISIBLE_RECORD_LOADER,
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
  @LoadRecordWith(${ctx.screamingSnakeName}_RECORD_LOADER, '${ctx.kebabName}')
  async publishToken(@Req() req: RequestWith${ctx.pascalName}) {
    const room = roomFor(req.record.id);
    await this.stream.ensureRoom(room);
    const token = await this.stream.publishToken(room, req.user.id);
    return ok({ room, token });
  }

  @Post('viewer-token')
  @Capability(canView${ctx.pascalName})
  @LoadRecordWith(${ctx.screamingSnakeName}_VISIBLE_RECORD_LOADER, '${ctx.kebabName}')
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
  ${ctx.screamingSnakeName}_VISIBLE_RECORD_LOADER,
} from './${ctx.kebabName}-record.loader';
import type { ${ctx.pascalName}RecordLoader } from './${ctx.kebabName}-record.loader';

function room(id: string): string {
  return '${ctx.kebabName}:' + id;
}

@WebSocketGateway({ namespace: '/live/${ctx.kebabName}' })
@UseGuards(LiveAuthGuard)
export class ${ctx.pascalName}LiveGateway implements OnGatewayConnection {
  constructor(
    @Inject(${ctx.screamingSnakeName}_VISIBLE_RECORD_LOADER)
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
// There is no more GET-by-id route: "can this user open the record directly"
// is now the same search endpoint filtered down to its id, so list scope and
// detail scope are provably the same check rather than two routes that could
// drift apart.
function scopeParityTest(ctx: ResourceContext, createBody: string): string {
  if (ctx.permissions.view === 'own' || ctx.permissions.view === 'team') {
    return `  it('keeps a record out of the results for anyone who cannot open it directly', async () => {
    const created = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/create')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ data: [${createBody}] })
      .expect(201);

    const recordId = (
      created.body as { data: { status: string; data: { id: string } }[] }
    ).data[0]!.data.id;

    const detail = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/search')
      .set('Authorization', \`Bearer \${strangerToken}\`)
      .send({ filters: [{ field: 'id', value: recordId }] })
      .expect(200);

    expect((detail.body as { data: unknown[] }).data).toHaveLength(0);

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
    return `  it('finds a record to anyone who can also list it', async () => {
    const created = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/create')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ data: [${createBody}] })
      .expect(201);

    const recordId = (
      created.body as { data: { status: string; data: { id: string } }[] }
    ).data[0]!.data.id;

    const detail = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/search')
      .set('Authorization', \`Bearer \${strangerToken}\`)
      .send({ filters: [{ field: 'id', value: recordId }] })
      .expect(200);

    expect(
      (detail.body as { data: { id: string }[] }).data.map((record) => record.id),
    ).toContain(recordId);

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
      .post('/${ctx.pluralKebabName}/create')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ data: [${createBody}] })
      .expect(201);

    const recordId = (
      created.body as { data: { status: string; data: { id: string } }[] }
    ).data[0]!.data.id;

    await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/delete')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ ids: [recordId] })
      .expect(201);

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
      .post('/${ctx.pluralKebabName}/create')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ data: [${createBody}] })
      .expect(201);

    const recordId = (
      created.body as { data: { status: string; data: { id: string } }[] }
    ).data[0]!.data.id;

    await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/delete')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ ids: [recordId] })
      .expect(201);

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

function relationSpecBlock(ctx: ResourceContext, createBody: string): string {
  if (ctx.relations.length === 0) {
    return '';
  }

  return ctx.relations
    .map((relation) => {
      const childBody =
        relation.childRequiredFields.length > 0
          ? `{ ${relation.childRequiredFields.map((field) => `${field.name}: ${sampleValueFor(field)}`).join(', ')} }`
          : '{}';

      return `
  it('attaches, syncs, and detaches ${relation.relation} through the update route', async () => {
    const created = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/create')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ data: [${createBody}] })
      .expect(201);

    const recordId = (
      created.body as { data: { status: string; data: { id: string } }[] }
    ).data[0]!.data.id;

    const childA = await prisma.${relation.childDelegate}.create({ data: ${childBody} });
    const childB = await prisma.${relation.childDelegate}.create({ data: ${childBody} });

    const attached = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/update')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({
        data: [{ id: recordId, relations: { ${relation.relation}: { attach: [childA.id] } } }],
      })
      .expect(201);

    expect(
      (attached.body as { data: { data: { ${relation.relation}: string[] } }[] })
        .data[0]!.data.${relation.relation},
    ).toEqual([childA.id]);

    const synced = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/update')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({
        data: [{ id: recordId, relations: { ${relation.relation}: { sync: [childB.id] } } }],
      })
      .expect(201);

    expect(
      (synced.body as { data: { data: { ${relation.relation}: string[] } }[] })
        .data[0]!.data.${relation.relation},
    ).toEqual([childB.id]);

    const detached = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/update')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({
        data: [{ id: recordId, relations: { ${relation.relation}: { detach: [childB.id] } } }],
      })
      .expect(201);

    expect(
      (detached.body as { data: { data: { ${relation.relation}: string[] } }[] })
        .data[0]!.data.${relation.relation},
    ).toEqual([]);
  });
`;
    })
    .join('');
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
    ? `  it('creates records owned by the current user, scoped to the current tenant', async () => {
    const response = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/create')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ data: [${createBody}] })
      .expect(201);

    expect(
      (
        response.body as {
          data: { status: string; data: { tenantId: string } }[];
        }
      ).data[0]!.data.tenantId,
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
    ? `  it('lists records with the capabilities named in the request body', async () => {
    await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/create')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ data: [${createBody}] })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/search')
      .send({ capabilities: ['update'] })
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .expect(200);

    const body = response.body as {
      data: Array<{ capabilities: { update: { allowed: boolean } } }>;
      meta: unknown;
    };
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0]?.capabilities.update.allowed).toBe(true);
    expect(body.meta).toMatchObject({
      capabilities: { create: { allowed: true, scope: '${ctx.permissions.create}' } },
      channels: ['${ctx.camelName}'],
    });
  });

`
    : ''
}${
    canCreateAny && canUpdateAny
      ? `  it('returns a real 403 when someone other than the owner tries to update it', async () => {
    const created = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/create')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ data: [${createBody}] })
      .expect(201);

    const recordId = (
      created.body as { data: { status: string; data: { id: string } }[] }
    ).data[0]!.data.id;

    const response = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/update')
      .set('Authorization', \`Bearer \${strangerToken}\`)
      .send({ data: [{ id: recordId, ...${createBody} }] })
      .expect(201);

    const results = (
      response.body as { data: { id: string; status: string; error?: { status: number } }[] }
    ).data;
    expect(results[0]).toMatchObject({
      id: recordId,
      status: 'error',
      error: { status: 403 },
    });
  });

`
      : ''
  }${
    canCreateAny && canUpdateAny && canDeleteAny
      ? `  it('soft-deletes then restores a record', async () => {
    const created = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/create')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ data: [${createBody}] })
      .expect(201);

    const recordId = (
      created.body as { data: { status: string; data: { id: string } }[] }
    ).data[0]!.data.id;

    await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/delete')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ ids: [recordId] })
      .expect(201);

    const trashed = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/search')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ filters: [{ field: 'id', value: recordId }] })
      .expect(200);

    expect((trashed.body as { data: unknown[] }).data).toHaveLength(0);

    await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/restore')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ ids: [recordId] })
      .expect(201);

    const restored = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/search')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ filters: [{ field: 'id', value: recordId }] })
      .expect(200);

    expect(
      (restored.body as { data: { id: string }[] }).data.map((record) => record.id),
    ).toContain(recordId);
  });

  it('refuses to restore a record that is not trashed', async () => {
    const created = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/create')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ data: [${createBody}] })
      .expect(201);

    const recordId = (
      created.body as { data: { status: string; data: { id: string } }[] }
    ).data[0]!.data.id;

    const response = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/restore')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ ids: [recordId] })
      .expect(201);

    const results = (
      response.body as { data: { id: string; status: string; error?: { status: number } }[] }
    ).data;
    expect(results[0]).toMatchObject({
      id: recordId,
      status: 'error',
      error: { status: 409 },
    });
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

  it('reports pagination meta alongside the results', async () => {
    await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/create')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ data: [${createBody}] })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/search')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({})
      .expect(200);

    const { meta } = response.body as {
      meta: { page: number; limit: number; total: number; last_page: number };
    };
    expect(meta.page).toBe(1);
    expect(meta.limit).toBe(${ctx.pagination.default});
    expect(meta.total).toBeGreaterThan(0);
    expect(meta.last_page).toBeGreaterThanOrEqual(1);
  });

  it('rejects an include naming a relation this resource does not declare', async () => {
    await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/search')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ includes: [{ relation: 'doesNotExist' }] })
      .expect(400);
  });

  it('rejects an aggregate naming a relation this resource does not declare', async () => {
    await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/search')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ aggregates: [{ relation: 'doesNotExist', type: 'count' }] })
      .expect(400);
  });
${
  primarySearchField
    ? `
  it('finds a record by text search through the explicitly named default engine', async () => {
    const created = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/create')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ data: [${createBody}] })
      .expect(201);

    const record = (
      created.body as { data: { status: string; data: Record<string, unknown> }[] }
    ).data[0]!.data;
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
}${relationSpecBlock(ctx, createBody)}});
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
