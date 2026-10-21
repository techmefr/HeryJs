import type { ResourceContext } from './resource-context';
import {
  fakerValueFor,
  graphqlTypeFor,
  prismaTypeFor,
  sampleValueFor,
  storedTsTypeFor,
  tsTypeFor,
  zodOutputTypeFor,
  zodTypeFor,
} from './field-types';
import { camelCase, screamingSnakeCase } from './naming';
import {
  workflowCapabilityKeys,
  workflowCapabilityLines,
  workflowControllerImports,
  workflowControllerTypeImports,
  workflowDescribe,
  workflowDtoBlock,
  workflowPolicyBlock,
  workflowPolicyImports,
  workflowPresetsBlock,
  workflowRoute,
  workflowServiceConstants,
  workflowServiceImports,
  workflowServiceMethods,
  workflowSpecBlock,
} from './workflow-templates';
import {
  vectorConstructorParameter,
  vectorConstructorBody,
  vectorSearchDispatch,
  vectorSearchOptions,
  vectorServiceConstants,
  vectorServiceImports,
  vectorSimilarMethod,
  vectorSpecFixtures,
  vectorSpecImports,
  vectorSpecOverride,
  vectorSpecTests,
  vectorTextResult,
} from './vector-templates';

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
${workflowPresetsBlock(ctx)}`;
}

function translatableFields(ctx: ResourceContext): ResourceContext['fields'] {
  return ctx.fields.filter((field) => field.translatable);
}

function translatableFieldsLiteral(ctx: ResourceContext): string {
  return `[${translatableFields(ctx)
    .map((field) => `{ name: '${field.name}', optional: ${field.optional} }`)
    .join(', ')}]`;
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
    attach: z.array(z.string()).max(MAX_BATCH_ENTRIES).optional(),
    detach: z.array(z.string()).max(MAX_BATCH_ENTRIES).optional(),
    sync: z.array(z.string()).max(MAX_BATCH_ENTRIES).optional(),
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
import { MAX_BATCH_ENTRIES } from '#technical/http/batch';${translatableFields(ctx).length > 0 ? `\nimport { translatableInputSchema } from '#technical/i18n/translatable';` : ''}

const ${ctx.camelName}Fields = z.object({
${fieldLines(ctx, '  ')}
});

/**
 * Where a rule that spans more than one field goes: "required only when status
 * is published", "endsAt must come after startsAt", "exactly one of these two".
 * A single field's own shape stays on the field above -- this is for the ones
 * no single field can express.
 *
 * It is empty because the blueprint cannot know them, and it is yours to fill:
 * this file is generated once and owned by you afterwards. Rules live here
 * rather than in the service so that a rejection is a 400 shaped like every
 * other validation error, naming the field it belongs to, instead of an
 * exception thrown halfway through a write.
 *
 * Add an issue per broken rule, with the path pointing at the field a caller
 * would have to fix:
 *
 *   if (input.status === 'published' && !input.publishedAt) {
 *     ctx.addIssue({
 *       code: 'custom',
 *       path: ['publishedAt'],
 *       message: 'is required when status is published',
 *     });
 *   }
 *
 * Applied to create and update alike. On update every field is optional, so a
 * rule reading two fields has to tolerate either being absent -- a partial
 * update that touches neither is not the request that breaks the rule.
 */
function check${ctx.pascalName}(
  input: Partial<z.infer<typeof ${ctx.camelName}Fields>>,
  ctx: z.RefinementCtx,
): void {
  void input;
  void ctx;
}

export const create${ctx.pascalName}Schema = ${ctx.camelName}Fields.superRefine(check${ctx.pascalName});
export type Create${ctx.pascalName}Input = z.infer<typeof create${ctx.pascalName}Schema>;

// The unrefined partial is kept because a refined schema can no longer be
// extended, and the update request adds an id and a relations block to it.
// Every path that extends it re-applies the same check afterwards.
const ${ctx.camelName}UpdateFields = ${ctx.camelName}Fields.partial();

export const update${ctx.pascalName}Schema = ${ctx.camelName}UpdateFields.superRefine(check${ctx.pascalName});
export type Update${ctx.pascalName}Input = z.infer<typeof update${ctx.pascalName}Schema>;
${relationSchemaBlock(ctx)}
// Every mutating verb separates the target (what it acts on) from the
// setting (how it acts) -- data/ids is always an array, even for a single
// record, so the response shape never has to differ between one and many.
export const create${ctx.pascalName}RequestSchema = z.object({
  data: z.array(create${ctx.pascalName}Schema).max(MAX_BATCH_ENTRIES),
  atomic: z.boolean().default(false),
});
export type Create${ctx.pascalName}RequestBody = z.infer<
  typeof create${ctx.pascalName}RequestSchema
>;

export const update${ctx.pascalName}RequestSchema = z.object({
  data: z.array(
    ${ctx.camelName}UpdateFields.extend({
      id: z.string(),${ctx.versioned ? `\n      version: z.number().int().positive().optional(),` : ''}${hasRelations ? `\n      relations: update${ctx.pascalName}RelationsSchema.optional(),` : ''}
    }).superRefine(check${ctx.pascalName}),
  ).max(MAX_BATCH_ENTRIES),
  atomic: z.boolean().default(false),
});
export type Update${ctx.pascalName}RequestBody = z.infer<
  typeof update${ctx.pascalName}RequestSchema
>;

${
  ctx.softDeletes
    ? `export const DELETE_MODES = ['soft', 'hard'] as const;
export type Delete${ctx.pascalName}Mode = (typeof DELETE_MODES)[number];

export const delete${ctx.pascalName}RequestSchema = z.object({
  ids: z.array(z.string()).max(MAX_BATCH_ENTRIES),
  mode: z.enum(DELETE_MODES).default('soft'),
  atomic: z.boolean().default(false),
});
export type Delete${ctx.pascalName}RequestBody = z.infer<
  typeof delete${ctx.pascalName}RequestSchema
>;

export const restore${ctx.pascalName}RequestSchema = z.object({
  ids: z.array(z.string()).max(MAX_BATCH_ENTRIES),
  // A short, scoped patch to reapply on restore -- not a second update, so
  // it reuses the update schema's own field whitelist rather than inventing
  // a narrower one.
  patch: update${ctx.pascalName}Schema.optional(),
  atomic: z.boolean().default(false),
});
export type Restore${ctx.pascalName}RequestBody = z.infer<
  typeof restore${ctx.pascalName}RequestSchema
>;
`
    : `// No mode and no restore: this resource declared softDeletes: false, so its
// delete route removes the row. Accepting a "soft" mode here would advertise a
// bin that no column exists to hold, and a restore route would answer for rows
// that are already gone.
export const delete${ctx.pascalName}RequestSchema = z.object({
  ids: z.array(z.string()).max(MAX_BATCH_ENTRIES),
  atomic: z.boolean().default(false),
});
export type Delete${ctx.pascalName}RequestBody = z.infer<
  typeof delete${ctx.pascalName}RequestSchema
>;
`
}${workflowDtoBlock(ctx)}`;
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

function recordCapabilityKeyList(ctx: ResourceContext): string[] {
  const keys = ['update', 'delete'];

  if (ctx.softDeletes) {
    keys.push('restore');
  }

  for (const relation of ctx.relations) {
    const pascalRelation = pascalRelationName(relation);
    keys.push(`attach${pascalRelation}`, `detach${pascalRelation}`);
  }

  keys.push(...workflowCapabilityKeys(ctx));

  return keys;
}

function recordCapabilityKeys(ctx: ResourceContext): string {
  return recordCapabilityKeyList(ctx)
    .map((key) => `'${key}'`)
    .join(' | ');
}

function metaCapabilityKeys(ctx: ResourceContext): string {
  return ctx.softDeletes
    ? "'create' | 'hardDelete' | 'listTrashed'"
    : "'create'";
}

function recordCapabilityLines(ctx: ResourceContext): string {
  const lines: string[] = [];

  if (ctx.softDeletes) {
    lines.push(`      restore: canRestore${ctx.pascalName}(subject, record),`);
  }

  for (const relation of ctx.relations) {
    const pascalRelation = pascalRelationName(relation);
    lines.push(
      `      attach${pascalRelation}: canAttach${pascalRelation}To${ctx.pascalName}(subject, record),`,
      `      detach${pascalRelation}: canDetach${pascalRelation}From${ctx.pascalName}(subject, record),`,
    );
  }

  lines.push(...workflowCapabilityLines(ctx));

  return lines.length > 0 ? '\n' + lines.join('\n') : '';
}

function resolvedCapabilityKeysLiteral(
  ctx: ResourceContext,
  sorted = false,
): string {
  const keys = recordCapabilityKeyList(ctx);

  return (sorted ? [...keys].sort() : keys).map((key) => `'${key}'`).join(', ');
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
import { ${ctx.screamingSnakeName}_PRESETS${ctx.workflow ? `, ${ctx.screamingSnakeName}_TRANSITION_PRESETS` : ''} } from './${ctx.kebabName}.presets';

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

${
  ctx.softDeletes
    ? `// Restore is the inverse of delete, not a kind of update -- whoever can
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

`
    : ''
}// Purge has no route today -- only the future admin decorator system reaches
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

${
  ctx.softDeletes
    ? `// Listing the bin is a moderation move, so it follows the delete preset rather
// than the read one.
export const canListTrashed${ctx.pascalName}: PolicyCheck = (subject) =>
  resolveCollectionCapability(${ctx.screamingSnakeName}_PRESETS.delete, subject);

`
    : ''
}${workflowPolicyBlock(ctx)}@Injectable()
export class ${ctx.pascalName}Policy {
  constructor(private readonly capabilities: CapabilitiesService) {}

  recordCapabilities(
    subject: CapabilitySubject,
    record: ${ctx.pascalName}RecordLike,
  ): Record<${recordCapabilityKeys(ctx)}, CapabilityDecision> {
    return {
      update: this.capabilities.resolve(${ctx.screamingSnakeName}_PRESETS.update, subject, record),
      delete: this.capabilities.resolve(${ctx.screamingSnakeName}_PRESETS.delete, subject, record),${recordCapabilityLines(ctx)}
    };
  }

  metaCapabilities(
    subject: CapabilitySubject,
  ): Record<${metaCapabilityKeys(ctx)}, CapabilityDecision> {
    return {
      create: canCreate${ctx.pascalName}(subject),${ctx.softDeletes ? `\n      hardDelete: canHardDelete${ctx.pascalName}(subject),\n      listTrashed: canListTrashed${ctx.pascalName}(subject),` : ''}
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

${
  ctx.softDeletes
    ? `// Update/delete/restore all need to find a record regardless of its
// soft-delete state (restore specifically targets trashed rows).
`
    : ''
}@Injectable()
export class ${ctx.pascalName}RecordLoader
  implements RecordLoader<${ctx.pascalName}RecordLike>
{
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async load(id: string) {
    return this.prisma.${ctx.modelCamelName}.findUnique({ where: { id } });
  }
}
${
  ctx.softDeletes
    ? `
// Plain reads must not resurface a soft-deleted record as if it still existed.
@Injectable()
export class ${ctx.pascalName}VisibleRecordLoader
  implements RecordLoader<${ctx.pascalName}RecordLike>
{
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async load(id: string) {
    const record = await this.prisma.${ctx.modelCamelName}.findUnique({ where: { id } });
    return record && !record.deletedAt ? record : null;
  }
}
`
    : `
// Without soft deletes there is no trashed state to hide, so "visible" and
// "any" are the same lookup. The symbol still exists, and still resolves to a
// loader, so an optional gateway or resolver that asks for the visible one
// keeps working instead of failing to inject.
export { ${ctx.pascalName}RecordLoader as ${ctx.pascalName}VisibleRecordLoader };
`
}`;
}

export function serviceFile(ctx: ResourceContext): string {
  const hasTranslatable = translatableFields(ctx).length > 0;
  const searchableFields = ctx.fields
    .filter((field) => field.type === 'string')
    .map((field) => field.name);
  const childIncludes = ownRouteIncludes(ctx);

  return `import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma, ${ctx.modelPascalName} } from '@prisma/client';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { AmbientTransactionStorage } from '#technical/prisma/transaction-context';
import { CapabilitySubject } from '#technical/capabilities/capabilities.types';
import { scopeWhereFor } from '#technical/capabilities/scope-where';
import { env } from '#technical/config/env';${ownedByTeam(ctx) ? `\nimport { NoCurrentTeamException } from '#technical/errors/no-current-team.exception';` : ''}
import { SignalService } from '#technical/signal/signal.service';
import { SearchEngineRegistry } from '#technical/search/search-engine.registry';${vectorServiceImports(ctx)}
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { writeAuditLog } from '#technical/audit/audit-log';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
${
  hasTranslatable
    ? `import {
  normalizeTranslatableWrite,
  searchDocumentFor,
} from '#technical/i18n/translatable';
import type { TranslatableFieldSpec } from '#technical/i18n/translatable';
import {
  hasTranslatableSort,
  resolveTranslatableFilters,
  sortByResolvedTranslations,
} from '#technical/i18n/translatable-query';
import type { TranslatableRow } from '#technical/i18n/translatable-query';
`
    : ''
}import { resolveRelationInstructions } from '#technical/http/relation-resolver';
import type { PrismaRelationClient } from '#technical/http/relation-resolver';
${ctx.versioned ? `import { VersionConflictException } from '#technical/errors/version-conflict.exception';\nimport { assertVersionIsCurrent, isLostRaceError } from '#technical/http/record-version';\nimport type { ExpectedVersion } from '#technical/http/record-version';\n` : ''}${workflowServiceImports(ctx)}import type { RelationInstruction${childIncludes.length > 0 ? ', ParsedListQuery' : ''} } from '#technical/http/list-query';${ctx.relations.length > 0 ? `\nimport { applyRelationMutation } from '#technical/http/relation-mutations';\nimport type { PivotDelegate, RelatedDelegate } from '#technical/http/relation-mutations';\nimport { MAX_BATCH_ENTRIES } from '#technical/http/batch';` : ''}
import {
  Create${ctx.pascalName}Input,${ctx.relations.length > 0 ? `\n  RelationMutationInput,` : ''}
  Update${ctx.pascalName}Input,
} from './${ctx.kebabName}.dto';
import { ${ctx.screamingSnakeName}_PRESETS } from './${ctx.kebabName}.presets';

const SEARCHABLE_FIELDS = [${searchableFields.map((name) => `'${name}'`).join(', ')}] as const;
const SEARCH_COLLECTION = '${ctx.kebabName}';${vectorServiceConstants(ctx)}${workflowServiceConstants(ctx)}${
    hasTranslatable
      ? `
const TRANSLATABLE_FIELDS: readonly TranslatableFieldSpec[] = ${translatableFieldsLiteral(ctx)};
const TRANSLATABLE_FIELD_NAMES = TRANSLATABLE_FIELDS.map((field) => field.name);`
      : ''
  }

export interface ${ctx.pascalName}SearchOptions {${
    ctx.softDeletes
      ? `
  withTrashed?: boolean;
  onlyTrashed?: boolean;`
      : ''
  }
  sorts?: { field: string; direction: 'asc' | 'desc' }[];
  where?: Record<string, unknown>;
  cursorWhere?: Record<string, unknown>;
  include?: Record<string, unknown>;
  relationInstructions?: RelationInstruction[];
  search?: string;
  searchEngine?: string;
${vectorSearchOptions(ctx)}  // null when the resource declares no pagination: every match, no window.
  page?: number | null;
  limit?: number | null;
}

export const ${ctx.screamingSnakeName}_SIGNAL_CHANNEL = '${ctx.camelName}';

@Injectable()
export class ${ctx.pascalName}Service {
  private readonly logger = new Logger(${ctx.pascalName}Service.name);

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
    private readonly signal: SignalService,
    private readonly searchEngines: SearchEngineRegistry,${vectorConstructorParameter(ctx)}
  ) {${vectorConstructorBody(ctx)}}

  private notify() {
    const channel = \`\${TenantContextStorage.getTenantId()}:\${${ctx.screamingSnakeName}_SIGNAL_CHANNEL}\`;

    void AmbientTransactionStorage.afterCommit(() => {
      void this.signal.publish(channel);
    });
  }

  // A search engine that is down must not turn into a failed write: the
  // Prisma call above this already committed, so the record is durable
  // either way. Losing the index update for one record is recoverable
  // (hery search:reindex backfills it); returning a 500 for a write that
  // actually succeeded is not. Every declared non-Prisma engine gets synced,
  // not just one -- search[engine] lets a later request read through any of
  // them, so a write has to reach all of them, and one engine being down
  // must not stop the others from getting the update.
  private async syncSearchIndex(record: ${ctx.modelPascalName}) {
    await AmbientTransactionStorage.afterCommit(() => this.indexRecord(record));
  }

  private async indexRecord(record: ${ctx.modelPascalName}) {${
    ctx.softDeletes
      ? `
    if (record.deletedAt) {
      await this.removeFromSearchIndex(record.id, record.tenantId);
      return;
    }
`
      : ''
  }
    for (const driver of this.searchEngines.externalDrivers) {
      try {
${
  hasTranslatable
    ? `        const document = searchDocumentFor(
          record,
          SEARCHABLE_FIELDS,
          TRANSLATABLE_FIELD_NAMES,
        );`
    : `        const document = Object.fromEntries(
          SEARCHABLE_FIELDS.map((field) => [field, record[field]]),
        );`
}
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

  // ${ctx.softDeletes ? 'Shared by soft delete (via syncSearchIndex above) and hard delete: a\n  // hard-deleted' : 'A deleted'} row has no updated record to read deletedAt off, only the
  // id and tenant it used to have.
  private async removeFromSearchIndex(id: string, tenantId: string) {
    await AmbientTransactionStorage.afterCommit(() => this.dropFromIndex(id, tenantId));
  }

  private async dropFromIndex(id: string, tenantId: string) {
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
${vectorSearchDispatch(ctx)}${
    ctx.softDeletes
      ? `    // Excluding trashed rows is the default branch, not an opt-in one: a
    // caller that says nothing gets live rows only, so a forgotten flag hides
    // a deleted record rather than resurfacing it.
    const trashedWhere = options.onlyTrashed
      ? { deletedAt: { not: null } }
      : options.withTrashed
        ? {}
        : { deletedAt: null };

`
      : ''
  }    // The matches carry whether the engine had to cut them, which travels back
    // to the caller as a message. A page of 15 out of a capped 1000 out of
    // 40000 real matches is a different answer than a page of 15 out of 1000,
    // and the caller cannot tell them apart unless it is told.
    const matches = options.search
      ? await this.searchEngines
          .resolve(options.searchEngine ?? this.searchEngines.defaultKeyword)
          .search(
            SEARCH_COLLECTION,
            options.search,
            SEARCHABLE_FIELDS,
            TenantContextStorage.getTenantId(),
            env.SEARCH_MATCH_LIMIT,
          )
      : undefined;
    const searchWhere = matches ? { id: { in: matches.ids } } : undefined;

    // The scope clause sits in its own AND branch so a declared filter can
    // never widen it back, whatever the caller passes in the query string.
${
  hasTranslatable
    ? `    const visibleWhere = {
      AND: [
        scopeWhereFor(${ctx.screamingSnakeName}_PRESETS.view, subject),${ctx.softDeletes ? '\n        trashedWhere,' : ''}
      ],
    };
    const filterWhere = options.where
      ? ((await resolveTranslatableFilters(options.where, (field) =>
          this.loadTranslations(visibleWhere, field),
        )) as Record<string, unknown>)
      : undefined;
`
    : ''
}    const where = {
      AND: [
        scopeWhereFor(${ctx.screamingSnakeName}_PRESETS.view, subject),${ctx.softDeletes ? '\n        trashedWhere,' : ''}
        ...(${hasTranslatable ? 'filterWhere' : 'options.where'} ? [${hasTranslatable ? 'filterWhere' : 'options.where'}] : []),
        ...(searchWhere ? [searchWhere] : []),
      ],
    };

    const page = options.page ?? 1;
    // undefined, never null: Prisma reads an absent take as "every row", which
    // is what a resource with no declared pagination asks for.
    const limit = options.limit ?? undefined;
${
  hasTranslatable
    ? `
    if (hasTranslatableSort(options.sorts, TRANSLATABLE_FIELD_NAMES)) {
      const sorted = await this.searchSortedByTranslation(
        where,
        options,
        page,
        limit,
      );

      return { ...sorted, matches };
    }
`
    : ''
}
    const [records, total] = await Promise.all([
      this.prisma.${ctx.modelCamelName}.findMany({
        where: options.cursorWhere
          ? { AND: [where, options.cursorWhere] }
          : where,
        orderBy:
          options.sorts && options.sorts.length > 0
            ? options.sorts.map((sort) => ({ [sort.field]: sort.direction }))
            : { createdAt: 'desc' },
        skip: limit ? (page - 1) * limit : undefined,
        take: limit,
        include: options.include as Prisma.${ctx.modelPascalName}Include | undefined,
      }),
      this.prisma.${ctx.modelCamelName}.count({ where }),
    ]);

    await resolveRelationInstructions(
      this.prisma as unknown as PrismaRelationClient,
      records,
      options.relationInstructions,
    );

    ${vectorTextResult(ctx)}
  }
${
  hasTranslatable
    ? `
  private async loadTranslations(
    where: Record<string, unknown>,
    field: string,
  ): Promise<TranslatableRow[]> {
    const rows = (await this.prisma.${ctx.modelCamelName}.findMany({
      where,
      select: { id: true, [field]: true },
    })) as unknown as Record<string, unknown>[];

    return rows.map((row) => ({ id: String(row.id), value: row[field] }));
  }

  private async searchSortedByTranslation(
    where: Record<string, unknown>,
    options: ${ctx.pascalName}SearchOptions,
    page: number,
    limit: number | undefined,
  ) {
    const sorts = options.sorts ?? [];
    const keys = (await this.prisma.${ctx.modelCamelName}.findMany({
      where,
      select: Object.fromEntries([
        ['id', true],
        ...sorts.map((sort) => [sort.field, true]),
      ]) as Prisma.${ctx.modelPascalName}Select,
    })) as unknown as Record<string, unknown>[];
    const ids = sortByResolvedTranslations(
      keys,
      sorts,
      TRANSLATABLE_FIELD_NAMES,
    ).map((row) => String(row.id));
    const pageIds = limit ? ids.slice((page - 1) * limit, page * limit) : ids;

    const found = await this.prisma.${ctx.modelCamelName}.findMany({
      where: { AND: [where, { id: { in: pageIds } }] },
      include: options.include as Prisma.${ctx.modelPascalName}Include | undefined,
    });
    const byId = new Map(found.map((record) => [record.id, record] as const));
    const records = pageIds.flatMap((id) => {
      const record = byId.get(id);

      return record ? [record] : [];
    });

    await resolveRelationInstructions(
      this.prisma as unknown as PrismaRelationClient,
      records,
      options.relationInstructions,
    );

    return { records, total: ids.length };
  }
`
    : ''
}${vectorSimilarMethod(ctx)}${childIncludes
    .map((include) => {
      const pascalRelation = pascalRelationName(include);
      const childDelegate = camelCase(include.resource);

      return `
  // Scoped to the already-loaded parent by ${include.foreignKey} -- there is
  // no capability of ${include.resource}'s own to apply, it is routed: false.
  // The controller already gated this call on the parent's own view
  // capability before it ever reaches here.
  async search${pascalRelation}(parentId: string, query: ParsedListQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? undefined;
    const where = {
      AND: [
        { ${include.foreignKey}: parentId },
        ...(query.where ? [query.where] : []),
      ],
    };

    const [records, total] = await Promise.all([
      this.prisma.${childDelegate}.findMany({
        where: query.cursorWhere
          ? { AND: [where, query.cursorWhere] }
          : where,
        orderBy:
          query.sorts && query.sorts.length > 0
            ? query.sorts.map((sort) => ({ [sort.field]: sort.direction }))
            : undefined,
        skip: limit ? (page - 1) * limit : undefined,
        take: limit,
        select: query.select as Prisma.${include.resource}Select | undefined,
      }),
      this.prisma.${childDelegate}.count({ where }),
    ]);

    return { records, total };
  }
`;
    })
    .join('')}
${ctx.relations
  .map((relation) => {
    const pascalRelation = pascalRelationName(relation);
    const select = `{ ${['id', ...relation.childFields.filter((name) => name !== 'id')].map((name) => `${name}: true`).join(', ')} }`;
    const where =
      relation.childSearchFields.length > 0
        ? `term
        ? {
            OR: [${relation.childSearchFields.map((name) => `{ ${name}: { contains: term, mode: 'insensitive' } }`).join(', ')}],
          }
        : {}`
        : '{}';

    return `
  async members${pascalRelation}(parentId: string) {
    const pivots = await (this.prisma.${relation.pivotDelegate} as unknown as PivotDelegate).findMany({
      where: { ${relation.foreignKey}: parentId },
      select: { ${relation.relatedKey}: true },
      take: MAX_BATCH_ENTRIES,
    });
    const ids = pivots.map((row) => row.${relation.relatedKey} as string);

    if (ids.length === 0) {
      return [];
    }

    return (this.prisma.${relation.childDelegate} as unknown as RelatedDelegate).findMany({
      where: { id: { in: ids } },
      select: ${select},
    });
  }

  async options${pascalRelation}(term?: string) {
    return (this.prisma.${relation.childDelegate} as unknown as RelatedDelegate).findMany({
      where: ${where},
      select: ${select},
      take: MAX_BATCH_ENTRIES,
    });
  }
`;
  })
  .join('')}
  atomically<T>(callback: () => Promise<T>): Promise<T> {
    return this.prisma.$atomic(callback);
  }

  async create(subject: CapabilitySubject, data: Create${ctx.pascalName}Input) {
${
  ownedByTeam(ctx)
    ? `    if (!subject.currentTeamId) {
      throw new NoCurrentTeamException();
    }

`
    : ''
}    const record = await this.prisma.${ctx.modelCamelName}.create({
      // tenantId is injected by the tenant-scoping Prisma extension, invisible to callers by design.
      data: {
        ...${hasTranslatable ? 'normalizeTranslatableWrite(data, TRANSLATABLE_FIELDS)' : 'data'},
        ownerId: subject.id,${ownedByTeam(ctx) ? `\n        // The team comes from the session, never from the request body, so a\n        // caller cannot file a record into a team it does not belong to.\n        teamId: subject.currentTeamId,` : ''}
      } as unknown as Prisma.${ctx.modelPascalName}CreateInput,
    });
    this.notify();
    await this.syncSearchIndex(record);
    return record;
  }

${
  ctx.versioned
    ? `  async update(
    record: ${ctx.modelPascalName},
    data: Update${ctx.pascalName}Input,
    expected: ExpectedVersion,
  ) {
    assertVersionIsCurrent('${ctx.kebabName}', expected, record.version);

    try {
      const updated = await this.prisma.${ctx.modelCamelName}.update({
        where: { id: record.id, version: expected.value },
        data: { ...${hasTranslatable ? 'normalizeTranslatableWrite(data, TRANSLATABLE_FIELDS, record)' : 'data'}, version: { increment: 1 } },
      });
      this.notify();
      await this.syncSearchIndex(updated);
      return updated;
    } catch (error) {
      if (isLostRaceError(error)) {
        throw new VersionConflictException('${ctx.kebabName}', expected.value, null, expected.source);
      }

      throw error;
    }
  }`
    : `  async update(record: ${ctx.modelPascalName}, data: Update${ctx.pascalName}Input) {
    const updated = await this.prisma.${ctx.modelCamelName}.update({ where: { id: record.id }, data${hasTranslatable ? `: normalizeTranslatableWrite(data, TRANSLATABLE_FIELDS, record)` : ''} });
    this.notify();
    await this.syncSearchIndex(updated);
    return updated;
  }`
}
${workflowServiceMethods(ctx)}${ctx.relations
    .map(
      (relation) => `
  async sync${pascalRelationName(relation)}(record: ${ctx.modelPascalName}, input: RelationMutationInput) {
    return applyRelationMutation(
      this.prisma.${relation.pivotDelegate} as unknown as PivotDelegate,
      this.prisma.${relation.childDelegate} as unknown as RelatedDelegate,
      '${relation.relation}',
      '${relation.foreignKey}',
      '${relation.relatedKey}',
      record.id,
      input,
    );
  }
`,
    )
    .join('')}
${
  ctx.softDeletes
    ? `  /**
   * Stamps deletedAt rather than removing the row, and nothing in this service
   * ever removes it afterwards: prune is what eventually frees the storage.
   * src/technical/prune/prunable-models.ts picks this model up automatically
   * off Prisma's DMMF -- the condition is exactly "has deletedAt and
   * tenantId", which is what the generated model carries -- and
   * PruneService.pruneModel hard-deletes every row whose deletedAt is older
   * than the model's configured retention, writing one audit entry per tenant
   * as it goes. So the two halves compose without either knowing about the
   * other: this one decides a record is gone, prune decides when gone becomes
   * unrecoverable. A resource generated with softDeletes: false has no
   * deletedAt at all and is therefore absent from prunableModels(), which is
   * correct -- its delete already freed the row.
   */
  async softDelete(record: ${ctx.modelPascalName}) {
    const updated = await this.prisma.${ctx.modelCamelName}.update({
      where: { id: record.id },
      data: { deletedAt: new Date()${ctx.versioned ? ', version: { increment: 1 }' : ''} },
    });
    this.notify();
    await this.syncSearchIndex(updated);
    return updated;
  }

  async restore(record: ${ctx.modelPascalName}, patch?: Update${ctx.pascalName}Input) {
    const updated = await this.prisma.${ctx.modelCamelName}.update({
      where: { id: record.id },
      data: { ...${hasTranslatable ? 'normalizeTranslatableWrite(patch ?? {}, TRANSLATABLE_FIELDS, record)' : 'patch'}, deletedAt: null${ctx.versioned ? ', version: { increment: 1 }' : ''} },
    });
    this.notify();
    await this.syncSearchIndex(updated);
    return updated;
  }

  // Distinct from softDelete: this removes the row rather than flagging it,`
    : `  // The only delete this resource has: it declared softDeletes: false, so
  // there is no deletedAt to stamp and no prune sweep to come later -- the row
  // is gone as soon as the route answers, and nothing restores it.`
}
  // and is reached only once the caller already holds the separate hard-delete
  // capability. Runs on the same tenant-scoped client as every other write, so
  // the audit extension records it exactly like any other audited delete.
  async hardDelete(record: ${ctx.modelPascalName}) {
    await this.prisma.${ctx.modelCamelName}.delete({ where: { id: record.id } });
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
  async purge(record: ${ctx.modelPascalName}) {
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

function paginationSpec(ctx: ResourceContext, createBody: string): string {
  const arrange = `    await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/create')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ data: [${createBody}] })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/search')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({})
      .expect(200);`;

  if (!ctx.pagination) {
    return `  it('returns every match and says it does not paginate', async () => {
${arrange}

    const { meta } = response.body as {
      meta: { paginated: boolean; total: number; page?: number };
    };
    expect(meta.paginated).toBe(false);
    expect(meta.page).toBeUndefined();
    expect(meta.total).toBeGreaterThan(0);
    expect(
      (response.body as { data: unknown[] }).data.length,
    ).toBe(meta.total);
  });

  it('rejects a caller who asks for a page of something that does not paginate', async () => {
    await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/search')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ limit: 10 })
      .expect(400);
  });`;
  }

  return `  it('reports pagination meta alongside the results', async () => {
${arrange}

    const { meta } = response.body as {
      meta: { page: number; limit: number; total: number; last_page: number };
    };
    expect(meta.page).toBe(1);
    expect(meta.limit).toBe(${ctx.pagination.default});
    expect(meta.total).toBeGreaterThan(0);
    expect(meta.last_page).toBeGreaterThanOrEqual(1);
  });

  it('rejects a page size the blueprint did not declare', async () => {
    await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/search')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ limit: ${Math.max(...ctx.pagination.limits) + 1} })
      .expect(400);
  });`;
}

/**
 * Nothing at all when the blueprint declared no pagination: a contract without
 * these two keys is what makes the search route return every match, and what
 * makes a caller naming `page` or `limit` a rejected request rather than an
 * ignored one.
 */
function paginationContractLines(
  pagination: ResourceContext['pagination'],
): string {
  if (!pagination) {
    return '';
  }

  return `  limits: [${pagination.limits.join(', ')}],
  defaultLimit: ${pagination.default},
`;
}

/**
 * An unpaginated route reports no page, no limit and no last_page rather than
 * inventing "page 1 of 1": there is no page, and `total` is the whole answer.
 */
function paginationMetaLines(
  pagination: ResourceContext['pagination'],
  hasSimilarMode = false,
): string {
  if (!pagination) {
    return '      paginated: false,\n';
  }

  return `      page: query.page ?? 1,
      limit: pageLimit,
      last_page: Math.max(1, Math.ceil(total / pageLimit)),
      next_cursor: ${hasSimilarMode ? 'similar ? null : ' : ''}nextCursorFor(records, query.sorts, pageLimit),
`;
}

// A relation of a relation: emitted only when the referenced blueprint itself
// declared includes, so a resource with none produces exactly the same
// output as before this existed -- no key ever appears empty.
function nestedIncludesContractLiteral(
  include: ResourceContext['includes'][number],
  indent: string,
): string {
  if (!include.includes || include.includes.length === 0) {
    return '';
  }

  const entries = include.includes
    .map(
      (nested) => `${indent}      ${nested.relation}: {
${relationLinkLiteral(nested, `${indent}  `)}
${indent}        filters: [${nested.filters.map((field) => `'${field}'`).join(', ')}],
${indent}        sorts: [${nested.sorts.map((field) => `'${field}'`).join(', ')}],
${indent}        selects: [${nested.selects.map((field) => `'${field}'`).join(', ')}],
${indent}      },`,
    )
    .join('\n');

  return `\n${indent}    includes: {\n${entries}\n${indent}    },`;
}

// Shared by the resource's own top-level includes map and, one level down,
// by a parent-scoped child route's contract -- both need the same
// relation-name-to-IncludeContract object literal, just sourced from a
// different list of resolved includes.
function includeMapLiteral(
  includes: readonly ResourceContext['includes'][number][],
  indent: string,
): string {
  if (includes.length === 0) return '{}';

  const entries = includes
    .map(
      (include) => `${indent}  ${include.relation}: {
${relationLinkLiteral(include, indent)}
${indent}    filters: [${include.filters.map((field) => `'${field}'`).join(', ')}],
${indent}    sorts: [${include.sorts.map((field) => `'${field}'`).join(', ')}],
${indent}    selects: [${include.selects.map((field) => `'${field}'`).join(', ')}],${nestedIncludesContractLiteral(include, indent)}
${indent}  },`,
    )
    .join('\n');

  return `{\n${entries}\n${indent}}`;
}

function includesContractLiteral(ctx: ResourceContext, indent: string): string {
  return includeMapLiteral(ctx.includes, indent);
}

// The includes on a blueprint that additionally opted into their own
// parent-scoped route -- POST /<parent>/:id/<relation>/search alongside
// being reachable as a nested include.
function ownRouteIncludes(ctx: ResourceContext): ResourceContext['includes'] {
  return ctx.includes.filter((include) => include.ownRoute);
}

// A parent-scoped child route needs the same full ListQueryContract shape a
// resource's own search route gets -- filters/sorts/selects/pagination, plus
// whatever the child itself nests -- built from the include's already
// resolved shape rather than the child's blueprint having a controller of
// its own to derive one from.
function childRouteContractLiteral(
  include: ResourceContext['includes'][number],
  indent: string,
): string {
  return `{
${indent}  filters: ['id', ${include.filters.map((field) => `'${field}'`).join(', ')}],
${indent}  sorts: [${include.sorts.map((field) => `'${field}'`).join(', ')}],
${indent}  selects: [${include.selects.map((field) => `'${field}'`).join(', ')}],
${indent}  includes: ${includeMapLiteral(include.includes ?? [], `${indent}  `)},
${paginationContractLines(include.pagination)}${indent}} as const satisfies ListQueryContract`;
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
  const translatable = translatableFields(ctx);
  const hasTranslatable = translatable.length > 0;
  const selectableFields = [
    'id',
    'ownerId',
    ...(ownedByTeam(ctx) ? ['teamId'] : []),
    ...ctx.fields
      .filter((field) => !field.hidden)
      .flatMap((field) =>
        field.translatable
          ? [field.name, `${field.name}Translations`]
          : [field.name],
      ),
    'createdAt',
    'updatedAt',
    ...(ctx.softDeletes ? ['deletedAt'] : []),
    ...(ctx.versioned ? ['version'] : []),
    ...(ctx.workflow ? [ctx.workflow.field] : []),
  ];
  const childIncludes = ownRouteIncludes(ctx);
  const hasParentRoutes = childIncludes.length > 0 || ctx.relations.length > 0;
  // The child route loads its parent through the loader that refuses a trashed
  // row: without it, soft-deleting a parent would leave its children listable
  // through POST /<parent>/:id/<relation>/search, which is the record coming
  // back through a relation the delete was supposed to take it out of.
  const childRouteLoader = ctx.softDeletes
    ? `${ctx.screamingSnakeName}_VISIBLE_RECORD_LOADER`
    : `${ctx.screamingSnakeName}_RECORD_LOADER`;

  return `import { Body, Controller, Get, ${ctx.versioned ? 'Headers, ' : ''}HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common';
import type { ${ctx.modelPascalName} } from '@prisma/client';
import { z } from 'zod';
import { SessionGuard } from '#technical/auth/session.guard';
import type { RequestWithUser } from '#technical/auth/session.guard';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { subjectOf } from '#technical/capabilities/subject';
import {
  Capability,${hasParentRoutes ? '\n  LoadRecordWith,' : ''}
} from '#technical/capabilities/capability.decorator';
import { CapabilityForbiddenException } from '#technical/errors/capability-forbidden.exception';
import { RecordNotFoundException } from '#technical/errors/record-not-found.exception';
${ctx.softDeletes ? `import { AlreadyRestoredException } from '#technical/errors/already-restored.exception';\n` : `import { SoftDeletesNotOfferedException } from '#technical/errors/invalid-query.exception';\n`}import { resolveDomainError } from '#technical/errors/domain-exception.filter';
import type { ResolvedError } from '#technical/errors/domain-exception.filter';
import { executeBatch } from '#technical/http/batch-execution';
import type { BatchEntry } from '#technical/http/batch-execution';
import { ok } from '#technical/http/envelope';
import { CacheableRead } from '#technical/http/etag.decorator';${ctx.versioned ? `\nimport { ifMatchVersionOf, resolveExpectedVersion } from '#technical/http/record-version';` : ''}
import {${ctx.pagination || childIncludes.some((include) => include.pagination) ? '\n  nextCursorFor,' : ''}
  parseSearchRequest,
  searchRequestSchema,
  withIncludesAndAggregates,${childIncludes.length > 0 ? '\n  declaredSelect,' : ''}
} from '#technical/http/list-query';
import type {
  ListQueryContract,
  SearchRequestBody,
} from '#technical/http/list-query';
${hasTranslatable ? `import { describeLocales } from '#technical/i18n/translatable';\n` : ''}import { ZodValidationPipe } from '#technical/validation/zod-validation.pipe';
import {
  create${ctx.pascalName}RequestSchema,
  create${ctx.pascalName}Schema,
  delete${ctx.pascalName}RequestSchema,${ctx.softDeletes ? `\n  restore${ctx.pascalName}RequestSchema,` : ''}
${workflowControllerImports(ctx)}  update${ctx.pascalName}RequestSchema,
  update${ctx.pascalName}Schema,
} from './${ctx.kebabName}.dto';
import type {
  Create${ctx.pascalName}RequestBody,
  Delete${ctx.pascalName}RequestBody,${ctx.softDeletes ? `\n  Restore${ctx.pascalName}RequestBody,` : ''}
${workflowControllerTypeImports(ctx)}  Update${ctx.pascalName}RequestBody,
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
${
  ctx.softDeletes
    ? `  canHardDelete${ctx.pascalName},
  canListTrashed${ctx.pascalName},
  canRestore${ctx.pascalName},
  canRestoreAny${ctx.pascalName},
`
    : ''
}  canUpdate${ctx.pascalName},
  canUpdateAny${ctx.pascalName},${hasParentRoutes ? `\n  canView${ctx.pascalName},` : ''}
  canViewAny${ctx.pascalName},
  ${ctx.pascalName}Policy,${workflowPolicyImports(ctx)}
} from './${ctx.kebabName}.policy';
import {
  ${ctx.screamingSnakeName}_SIGNAL_CHANNEL,
  ${ctx.pascalName}Service,
} from './${ctx.kebabName}.service';
import {
  ${ctx.screamingSnakeName}_RECORD_LOADER,${hasParentRoutes && ctx.softDeletes ? `\n  ${ctx.screamingSnakeName}_VISIBLE_RECORD_LOADER,` : ''}
} from './${ctx.kebabName}-record.loader';
import type { ${ctx.pascalName}RecordLoader } from './${ctx.kebabName}-record.loader';
import { to${ctx.pascalName}View } from './${ctx.kebabName}.view';
import type { ${ctx.pascalName}View } from './${ctx.kebabName}.view';

// What the search route accepts, declared once. parseSearchRequest validates
// against this object and GET /describe publishes it, so the endpoint cannot
// advertise a contract it does not honour -- or honour one it never mentions.
// Two literals disagreed on id, which is filterable and used to be missing
// from describe.
const ${ctx.screamingSnakeName}_CONTRACT = {
  sorts: [${ctx.sorts.map((field) => `'${field}'`).join(', ')}],
  filters: ['id', ${ctx.filters.map((field) => `'${field}'`).join(', ')}],
  selects: [${selectableFields.map((field) => `'${field}'`).join(', ')}],${hasTranslatable ? `\n  translatable: [${translatable.map((field) => `'${field.name}'`).join(', ')}],` : ''}
  includes: ${includesContractLiteral(ctx, '  ')},
  aggregates: ${aggregatesContractLiteral(ctx, '  ')},
${ctx.vector ? '  similar: true,\n' : ''}${paginationContractLines(ctx.pagination)}} as const satisfies ListQueryContract;

// Computed once at module load, not per request: the blueprint's shape never
// changes at runtime, and the Zod schemas already own the create/update
// contract, so their JSON Schema is the rules a frontend needs -- reflected
// straight off the DTO rather than duplicated by hand.
const ${ctx.screamingSnakeName}_DESCRIBE = {
  // Published so a client can tell which contract it is holding without
  // inferring it from the path it happened to call.
  version: ${ctx.version},
  fields: [
${ctx.fields.map((field) => `    { name: '${field.name}', type: '${field.type}', optional: ${field.optional}${field.translatable ? ', translatable: true' : ''} },`).join('\n')}
  ],${hasTranslatable ? '\n  locales: describeLocales(),' : ''}
  ...${ctx.screamingSnakeName}_CONTRACT,
  // Stated rather than implied by the absence of limits: a client reading this
  // knows the search route returns every match, and that asking for a page is
  // an error rather than a no-op.
  paginated: ${ctx.pagination ? 'true' : 'false'},
  softDeletes: ${ctx.softDeletes ? 'true' : 'false'},${ctx.versioned ? `\n  versioned: { field: 'version', header: 'If-Match' },` : ''}${workflowDescribe(ctx)}
  // The many-to-many relations the update route can attach to and detach from
  // by id. A client builds its relation controls from this list and reads
  // whether each is allowed from the record's own capabilities, so it neither
  // guesses the relation names nor re-derives who may change them.
  relations: [${ctx.relations.map((relation) => `'${relation.relation}'`).join(', ')}],
  // A date has no JSON Schema form, and without this the whole module throws
  // at load for any resource that declares a datetime field. The field list
  // above still says which fields are dates.
  rules: {
    create: z.toJSONSchema(create${ctx.pascalName}Schema, { unrepresentable: 'any' }),
    update: z.toJSONSchema(update${ctx.pascalName}Schema, { unrepresentable: 'any' }),
  },
};
${
  hasParentRoutes
    ? `\ntype RequestWith${ctx.pascalName} = RequestWithUser & { record: ${ctx.modelPascalName} };
`
    : ''
}${childIncludes
    .map(
      (include) => `
// What \`POST /${ctx.pluralKebabName}/:id/${include.relation}/search\` accepts --
// the same shape as a resource's own search contract, derived from
// ${include.resource}'s blueprint rather than retyped here.
const ${ctx.screamingSnakeName}_${screamingSnakeCase(include.relation)}_CONTRACT = ${childRouteContractLiteral(include, '')};
`,
    )
    .join('')}
${
  ctx.relations.length > 0
    ? `\n// The picker for a relation asks for candidates by a free-text term; the\n// related resource has no search route of its own, so this is the whole contract.\nconst relationOptionsSchema = z.object({ q: z.string().max(255).optional() });\n`
    : ''
}
@Controller('${ctx.routePath}')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class ${ctx.pascalName}Controller {
  constructor(
    private readonly ${ctx.camelName}s: ${ctx.pascalName}Service,
    private readonly policy: ${ctx.pascalName}Policy,
    @Inject(${ctx.screamingSnakeName}_RECORD_LOADER)
    private readonly loader: ${ctx.pascalName}RecordLoader,
  ) {}

  private runBatch<T>(entries: BatchEntry<T>[], atomic: boolean) {
    return executeBatch(entries, {
      atomic,
      runAtomically: (callback) => this.${ctx.camelName}s.atomically(callback),
    });
  }

  // Reused by update/delete${ctx.softDeletes ? '/restore' : ''}: each id is loaded and checked on its
  // own, and a missing record or a denied one becomes that id's entry in the
  // batch result rather than aborting every other id in the same request.
  private async loadAndAuthorize(
    ids: string[],
    subject: ReturnType<typeof subjectOf>,
    check: (subject: ReturnType<typeof subjectOf>, record: unknown) => { allowed: boolean },
  ) {
    const entries: Array<
      | { index: number; id: string; ok: true; record: ${ctx.modelPascalName} }
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
  @CacheableRead()
  async search(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(searchRequestSchema)) body: SearchRequestBody,
  ) {
    const query = parseSearchRequest(body, ${ctx.screamingSnakeName}_CONTRACT);
    const subject = subjectOf(req.user);

${
  ctx.softDeletes
    ? `    if (query.withTrashed || query.onlyTrashed) {
      const trashedDecision = canListTrashed${ctx.pascalName}(subject);

      if (!trashedDecision.allowed) {
        throw new CapabilityForbiddenException(trashedDecision);
      }
    }
`
    : `    // The framework parses withTrashed/onlyTrashed for every resource, but this
    // one declared softDeletes: false and has no bin. Ignoring the flag would
    // hand back live rows while the caller believes it is reading the trash.
    if (query.withTrashed || query.onlyTrashed) {
      throw new SoftDeletesNotOfferedException(
        query.onlyTrashed ? 'onlyTrashed' : 'withTrashed',
      );
    }
`
}
    const { records, total, matches${ctx.vector ? ', similar' : ''} } = await this.${ctx.camelName}s.search(subject, query);
    const capabilities = body.capabilities ?? [];
    const select = query.select;
    const project = (view: Record<string, unknown>) =>
      select
        ? Object.fromEntries(
            Object.entries(view).filter(([key]) => key in select),
          )
        : view;
${ctx.pagination ? `    const pageLimit = query.limit ?? ${ctx.pagination.default};\n` : ''}    const meta = {
      channels: [${ctx.screamingSnakeName}_SIGNAL_CHANNEL],
${paginationMetaLines(ctx.pagination, ctx.vector !== null)}      total,
      ...(matches
        ? { search: { matchLimit: matches.limit, truncated: matches.truncated${ctx.vector ? ", ...(similar ? { mode: 'similar', metric: similar.metric } : {})" : ''} } }
        : {}),
    };

    // A truncated match set makes total a floor rather than a count, so the
    // response says which one it is instead of leaving the caller to trust a
    // number that is quietly wrong.
    const messages = matches?.truncated
      ? [
          ${
            ctx.vector
              ? `similar
            ? \`Only the \${matches.limit} nearest matches are ranked and returned. Narrow the query or add filters to reach the rest.\`
            : `
              : ''
          }\`Only the first \${matches.limit} full-text matches were counted, and more exist. The totals below are a floor, not a count -- narrow the search term to see the rest.\`,
        ]
      : [];

    if (capabilities.length === 0) {
      return ok(
        records.map((record) =>
          withIncludesAndAggregates(project(to${ctx.pascalName}View(record)), record, query),
        ),
        meta,
        messages,
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
      messages,
    );
  }

  @Get('describe')
  @Capability(canViewAny${ctx.pascalName})
  @CacheableRead()
  describe() {
    return ok(${ctx.screamingSnakeName}_DESCRIBE);
  }
${childIncludes
  .map((include) => {
    const pascalRelation = pascalRelationName(include);
    const contractName = `${ctx.screamingSnakeName}_${screamingSnakeCase(include.relation)}_CONTRACT`;

    return `
  // The parent's own view capability is what gates this route: ${include.resource}
  // has none of its own -- it is routed: false -- so seeing its rows is
  // exactly seeing the ${ctx.kebabName} they belong to.
  @Post(':id/${include.relation}/search')
  @HttpCode(200)
  @Capability(canView${ctx.pascalName})
  @CacheableRead()
  @LoadRecordWith(${childRouteLoader}, '${ctx.kebabName}')
  async search${pascalRelation}(
    @Req() req: RequestWith${ctx.pascalName},
    @Body(new ZodValidationPipe(searchRequestSchema)) body: SearchRequestBody,
  ) {
    const query = parseSearchRequest(body, ${contractName});
    const select = query.select ?? declaredSelect(${contractName});
    const { records, total } = await this.${ctx.camelName}s.search${pascalRelation}(
      req.record.id,
      { ...query, select },
    );
${include.pagination ? `    const pageLimit = query.limit ?? ${include.pagination.default};\n` : ''}    const meta = {
${paginationMetaLines(include.pagination)}      total,
    };

    return ok(records, meta);
  }
`;
  })
  .join('')}${ctx.relations
    .map((relation) => {
      const pascalRelation = pascalRelationName(relation);

      return `
  // Reading who is attached is reading the ${ctx.kebabName}, so the view
  // capability gates it; the related resource has no route or capability of
  // its own to ask instead.
  @Post(':id/${relation.relation}/members')
  @HttpCode(200)
  @Capability(canView${ctx.pascalName})
  @LoadRecordWith(${childRouteLoader}, '${ctx.kebabName}')
  async members${pascalRelation}(@Req() req: RequestWith${ctx.pascalName}) {
    return ok(await this.${ctx.camelName}s.members${pascalRelation}(req.record.id));
  }

  // Candidates to attach are offered only to a caller who may attach.
  @Post(':id/${relation.relation}/options')
  @HttpCode(200)
  @Capability(canAttach${pascalRelation}To${ctx.pascalName})
  @LoadRecordWith(${childRouteLoader}, '${ctx.kebabName}')
  async options${pascalRelation}(
    @Body(new ZodValidationPipe(relationOptionsSchema)) body: { q?: string },
  ) {
    return ok(await this.${ctx.camelName}s.options${pascalRelation}(body.q));
  }
`;
    })
    .join('')}
  @Post('create')
  @Capability(canCreate${ctx.pascalName})
  async create(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(create${ctx.pascalName}RequestSchema))
    body: Create${ctx.pascalName}RequestBody,
  ) {
    const subject = subjectOf(req.user);
    const entries = body.data.map(
      (item, index): BatchEntry<${ctx.pascalName}View> => ({
        index,
        run: async () => to${ctx.pascalName}View(await this.${ctx.camelName}s.create(subject, item)),
      }),
    );

    const { results, meta } = await this.runBatch(entries, body.atomic);

    return ok(results, meta);
  }

${workflowRoute(ctx)}
  @Post('update')
  @Capability(canUpdateAny${ctx.pascalName})
  async update(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(update${ctx.pascalName}RequestSchema))
    body: Update${ctx.pascalName}RequestBody,${ctx.versioned ? `\n    @Headers('if-match') ifMatch?: string,` : ''}
  ) {
    const subject = subjectOf(req.user);${ctx.versioned ? `\n    const ifMatchVersion = ifMatchVersionOf(ifMatch, body.data.length);` : ''}
    const loaded = await this.loadAndAuthorize(
      body.data.map((item) => item.id),
      subject,
      (s, record) => canUpdate${ctx.pascalName}(s, record as never),
    );

    const entries = loaded.map((entry, index): BatchEntry<${ctx.relations.length > 0 ? 'unknown' : `${ctx.pascalName}View`}> => {
      if (!entry.ok) {
        return { index, id: entry.id, failure: entry.error };
      }

      const { id: _id,${ctx.versioned ? ' version,' : ''}${ctx.relations.length > 0 ? ' relations,' : ''} ...data } = body.data[index]!;

      return {
        index,
        id: entry.id,
        run: async () => {
${ctx.versioned ? `        const expected = resolveExpectedVersion('${ctx.kebabName}', version, ifMatchVersion);\n` : ''}        const updated = await this.${ctx.camelName}s.update(entry.record, data${ctx.versioned ? ', expected' : ''});
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
}        return { ...to${ctx.pascalName}View(updated)${ctx.relations.length > 0 ? ', ...relationResults' : ''} };
        },
      };
    });

    const { results, meta } = await this.runBatch(entries, body.atomic);

    return ok(results, meta);
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

${
  ctx.softDeletes
    ? `    if (body.mode === 'hard') {
      const hardDecision = canHardDelete${ctx.pascalName}(subject);

      if (!hardDecision.allowed) {
        throw new CapabilityForbiddenException(hardDecision);
      }
    }

`
    : ''
}    const entries = loaded.map((entry, index): BatchEntry<${ctx.pascalName}View | null> => {
      if (!entry.ok) {
        return { index, id: entry.id, failure: entry.error };
      }

      return {
        index,
        id: entry.id,
        run: async () => {
${
  ctx.softDeletes
    ? `          if (body.mode === 'hard') {
            await this.${ctx.camelName}s.hardDelete(entry.record);
            return null;
          }

          return to${ctx.pascalName}View(await this.${ctx.camelName}s.softDelete(entry.record));`
    : `          await this.${ctx.camelName}s.hardDelete(entry.record);
          return null;`
}
        },
      };
    });

    const { results, meta } = await this.runBatch(entries, body.atomic);

    return ok(results, meta);
  }
${
  ctx.softDeletes
    ? `
  // A route rather than a service method alone: restore is the only way back
  // from the delete route, and a bin nobody can reach over HTTP is a bin that
  // silently becomes a leak of storage nobody audits. It is gated by the
  // delete preset, not the update one -- see canRestore${ctx.pascalName}.
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

    const entries = loaded.map((entry, index): BatchEntry<${ctx.pascalName}View> => {
      if (!entry.ok) {
        return { index, id: entry.id, failure: entry.error };
      }

      return {
        index,
        id: entry.id,
        run: async () => {
          if (!entry.record.deletedAt) {
            throw new AlreadyRestoredException('${ctx.kebabName}');
          }

          return to${ctx.pascalName}View(await this.${ctx.camelName}s.restore(entry.record, body.patch));
        },
      };
    });

    const { results, meta } = await this.runBatch(entries, body.atomic);

    return ok(results, meta);
  }
`
    : ''
}}
`;
}

export function changeFeedFile(ctx: ResourceContext): string {
  return `import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ChangeFeedRegistry } from '#technical/change-feed/change-feed.registry';
import {
  canUpdateAny${ctx.pascalName},
  canView${ctx.pascalName},
  canViewAny${ctx.pascalName},
} from './${ctx.kebabName}.policy';
import { ${ctx.screamingSnakeName}_VISIBLE_RECORD_LOADER } from './${ctx.kebabName}-record.loader';
import type { ${ctx.pascalName}RecordLoader } from './${ctx.kebabName}-record.loader';
import { ${ctx.screamingSnakeName}_SIGNAL_CHANNEL } from './${ctx.kebabName}.service';
import { to${ctx.pascalName}View } from './${ctx.kebabName}.view';

@Injectable()
export class ${ctx.pascalName}ChangeFeed implements OnModuleInit {
  constructor(
    private readonly feed: ChangeFeedRegistry,
    @Inject(${ctx.screamingSnakeName}_VISIBLE_RECORD_LOADER)
    private readonly loader: ${ctx.pascalName}RecordLoader,
  ) {}

  onModuleInit(): void {
    this.feed.register({
      model: '${ctx.modelPascalName}',
      channel: ${ctx.screamingSnakeName}_SIGNAL_CHANNEL,
      canViewAny: canViewAny${ctx.pascalName},
      canView: canView${ctx.pascalName},
      canBroadcast: canUpdateAny${ctx.pascalName},
      load: (id) => this.loader.load(id),
      toView: to${ctx.pascalName}View,
    });
  }
}
`;
}

export function moduleFile(ctx: ResourceContext): string {
  return `import { Module } from '@nestjs/common';
import { AuthModule } from '#technical/auth/auth.module';
import { CapabilitiesService } from '#technical/capabilities/capabilities.service';
import { ChangeFeedModule } from '#technical/change-feed/change-feed.module';
import { PrismaModule } from '#technical/prisma/prisma.module';
import { SearchModule } from '#technical/search/search.module';
import { SignalModule } from '#technical/signal/signal.module';${ctx.vector ? "\nimport { VectorModule } from '#technical/vector/vector.module';" : ''}
import { ${ctx.pascalName}ChangeFeed } from './${ctx.kebabName}.change-feed';
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
  imports: [
    PrismaModule,
    AuthModule,
    SearchModule,
    SignalModule,
    ChangeFeedModule${ctx.vector ? ', VectorModule' : ''},
  ],
  controllers: [${ctx.pascalName}Controller],
  providers: [
    ${ctx.pascalName}Service,
    ${ctx.pascalName}Policy,
    ${ctx.pascalName}ChangeFeed,
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
    .map((field) => {
      const isNullable = field.optional || field.translatable;

      return `  @Field(() => ${graphqlTypeFor(field)}${isNullable ? ', { nullable: true }' : ''})\n  declare ${field.name}${isNullable ? '?' : ''}: ${tsTypeFor(field)}${field.translatable ? ' | null' : ''};`;
    })
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
    ...(ctx.versioned || ctx.fields.some((field) => field.type === 'int')
      ? ['Int']
      : []),
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
import { RateLimit } from '#technical/rate-limit/rate-limit.decorator';
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

${objectFields}${ctx.versioned ? `\n\n  @Field(() => Int)\n  declare version: number;` : ''}
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

  @RateLimit('read')
  @Query(() => [${ctx.pascalName}Type], { name: '${ctx.pluralCamelName}' })
  async search(@CurrentGqlRequest() req: GqlRequestWithUser) {
    const subject = subjectOf(req.user);
    const decision = canViewAny${ctx.pascalName}(subject);
    if (!decision.allowed) {
      throw new CapabilityForbiddenException();
    }

    const { records } = await this.${ctx.camelName}s.search(subject, ${ctx.pagination ? `{\n      limit: ${ctx.pagination.default},\n    }` : '{}'});

    return records.map(to${ctx.pascalName}View);
  }

  @RateLimit('read')
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

  @RateLimit('write')
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

  @RateLimit('write')
  @Mutation(() => ${ctx.pascalName}Type, { name: 'update${ctx.pascalName}' })
  async update(
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: Update${ctx.pascalName}Input,${ctx.versioned ? `\n    @Args('version', { type: () => Int }) version: number,` : ''}
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
      await this.${ctx.camelName}s.update(record, input${ctx.versioned ? ", { value: version, source: 'body' }" : ''}),
    );
  }

  @RateLimit('write')
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

${
  ctx.softDeletes
    ? `    return to${ctx.pascalName}View(await this.${ctx.camelName}s.softDelete(record));`
    : `    // The row is gone once hardDelete returns, so the view is built from the
    // record as it was read a moment ago -- there is nothing left to re-read.
    const view = to${ctx.pascalName}View(record);
    await this.${ctx.camelName}s.hardDelete(record);
    return view;`
}
  }
}
`;
}

export function mcpToolsFile(ctx: ResourceContext): string {
  return `import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Inject, Injectable } from '@nestjs/common';
import type { CapabilitySubject } from '#technical/capabilities/capabilities.types';
${ctx.versioned ? `import { VersionConflictException } from '#technical/errors/version-conflict.exception';\n` : ''}import type { McpToolRegistrar } from '#technical/mcp/mcp-tool-registrar';
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
        // The tool used to declare no input at all while describing itself as
        // a search, so a client passing a term got the most recent page back
        // and no indication the term had been dropped. Everything accepted
        // here is something the service already understands; what is not
        // offered -- includes, aggregates, relation instructions -- is left
        // out because an MCP client has no way to name them.
        inputSchema: {
          search: z.string().optional(),
          sortBy: z.enum([${ctx.sorts.map((sort) => `'${sort}'`).join(', ')}]).optional(),
          sortDirection: z.enum(['asc', 'desc']).optional(),${
            ctx.pagination
              ? `
          page: z.number().int().positive().optional(),
          limit: z.enum([${ctx.pagination.limits.map((limit) => `'${limit}'`).join(', ')}]).optional(),`
              : ''
          }${ctx.softDeletes ? '\n          withTrashed: z.boolean().optional(),' : ''}
        },
      },
      async (input) => {
        const decision = canViewAny${ctx.pascalName}(subject);
        if (!decision.allowed) {
          return deniedResult();
        }

        const { records } = await this.${ctx.camelName}s.search(subject, {
          ...(input.search ? { search: input.search } : {}),
          ...(input.sortBy
            ? {
                sorts: [
                  {
                    field: input.sortBy,
                    direction: input.sortDirection ?? 'asc',
                  },
                ],
              }
            : {}),${
              ctx.pagination
                ? `
          page: input.page ?? 1,
          limit: input.limit ? Number(input.limit) : ${ctx.pagination.default},`
                : ''
            }${ctx.softDeletes ? '\n          withTrashed: input.withTrashed ?? false,' : ''}
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
        inputSchema: { id: z.string(), ${ctx.versioned ? 'version: z.number().int().positive(), ' : ''}...update${ctx.pascalName}Schema.shape },
      },
      async ({ id, ${ctx.versioned ? 'version, ' : ''}...input }) => {
        const record = await this.loader.load(id);
        if (!record) {
          return textResult({ error: 'not found' });
        }

        const decision = canUpdate${ctx.pascalName}(subject, record);
        if (!decision.allowed) {
          return deniedResult();
        }

${
  ctx.versioned
    ? `        try {
          const updated = await this.${ctx.camelName}s.update(record, input, { value: version, source: 'body' });
          return textResult(to${ctx.pascalName}View(updated));
        } catch (error) {
          if (error instanceof VersionConflictException) {
            return textResult({ error: error.message });
          }

          throw error;
        }`
    : `        const updated = await this.${ctx.camelName}s.update(record, input);
        return textResult(to${ctx.pascalName}View(updated));`
}
      },
    );

    server.registerTool(
      'remove_${ctx.kebabName}',
      {
        description: '${ctx.softDeletes ? 'Soft-delete' : 'Permanently delete'} a ${ctx.kebabName} by id',
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

${
  ctx.softDeletes
    ? `        const removed = await this.${ctx.camelName}s.softDelete(record);
        return textResult(to${ctx.pascalName}View(removed));`
    : `        const view = to${ctx.pascalName}View(record);
        await this.${ctx.camelName}s.hardDelete(record);
        return textResult(view);`
}
      },
    );
  }
}
`;
}

export function streamControllerFile(ctx: ResourceContext): string {
  return `import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { ${ctx.modelPascalName} } from '@prisma/client';
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

type RequestWith${ctx.pascalName} = RequestWithUser & { record: ${ctx.modelPascalName} };

function roomFor(id: string): string {
  return '${ctx.kebabName}:' + id;
}

@Controller('${ctx.routePath}/:id/stream')
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
  // Nothing to assert on a resource with no bin: canListTrashed is not
  // generated at all when softDeletes is off.
  if (!ctx.softDeletes) {
    return '';
  }

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

/**
 * The regression this exists for: a soft-deleted record that comes back
 * somewhere the default filter was not applied. Every read surface the
 * resource has is asserted on the same trashed record -- the plain list, the
 * declared includes and aggregates, and the parent-scoped child route -- then
 * the explicit withTrashed surface is asserted to still find it, so "absent"
 * is proven to mean hidden rather than gone.
 */
function softDeleteVisibilitySpec(
  ctx: ResourceContext,
  createBody: string,
): string {
  const includeBody =
    ctx.includes.length > 0
      ? `, includes: [{ relation: '${ctx.includes[0]!.relation}' }]`
      : '';
  const aggregateBody =
    ctx.aggregates.length > 0
      ? `, aggregates: [{ relation: '${ctx.aggregates[0]!.relation}', type: 'count' }]`
      : '';
  const childRoute = ownRouteIncludes(ctx)[0];

  return `  it('hides a soft-deleted record from every default read, and only from those', async () => {
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

    const ids = async (body: Record<string, unknown>) => {
      const response = await request(app.getHttpServer())
        .post('/${ctx.pluralKebabName}/search')
        .set('Authorization', \`Bearer \${ownerToken}\`)
        .send(body)
        .expect(200);

      return (response.body as { data: { id: string }[] }).data.map(
        (record) => record.id,
      );
    };

    expect(await ids({})).not.toContain(recordId);
    expect(
      await ids({
        filters: [{ field: 'id', value: recordId }]${includeBody},
      }),
    ).not.toContain(recordId);
    expect(
      await ids({
        filters: [{ field: 'id', value: recordId }]${aggregateBody},
      }),
    ).not.toContain(recordId);

    const counted = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/search')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ filters: [{ field: 'id', value: recordId }] })
      .expect(200);

    expect((counted.body as { meta: { total: number } }).meta.total).toBe(0);
${
  childRoute
    ? `
    await request(app.getHttpServer())
      .post(\`/${ctx.pluralKebabName}/\${recordId}/${childRoute.relation}/search\`)
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({})
      .expect(404);
`
    : ''
}
    expect(
      await ids({
        withTrashed: true,
        filters: [{ field: 'id', value: recordId }],
      }),
    ).toContain(recordId);
    expect(
      await ids({
        onlyTrashed: true,
        filters: [{ field: 'id', value: recordId }],
      }),
    ).toContain(recordId);

    await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/restore')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ ids: [recordId] })
      .expect(201);

    expect(
      await ids({ filters: [{ field: 'id', value: recordId }] }),
    ).toContain(recordId);
  });
`;
}

/**
 * The opted-out counterpart: the row is really gone, and the trashed
 * parameters are refused rather than quietly answering with live rows.
 */
function hardDeleteOnlySpec(ctx: ResourceContext, createBody: string): string {
  return `  it('removes the row outright and offers no bin to look in', async () => {
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

    expect(
      await prisma.${ctx.modelCamelName}.findUnique({ where: { id: recordId } }),
    ).toBeNull();

    await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/search')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ withTrashed: true })
      .expect(400);

    await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/restore')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ ids: [recordId] })
      .expect(404);
  });
`;
}

function bulkSpecBlock(ctx: ResourceContext, createBody: string): string {
  const route = `/${ctx.pluralKebabName}`;
  const versionPart = ctx.versioned ? ' version: 1,' : '';
  const bodyPart = createBody === '{}' ? '' : `...${createBody}`;

  const rollbackTest = ctx.versioned
    ? `
  it('undoes the entries already written when a later entry of an atomic batch fails', async () => {
    const first = await createOne();
    const second = await createOne();

    const response = await request(app.getHttpServer())
      .post('${route}/update')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({
        atomic: true,
        data: [
          { id: first, version: 1, ${bodyPart} },
          { id: second, version: 99, ${bodyPart} },
        ],
      })
      .expect(422);

    const error = (
      response.body as { error: { key: string; details: { results: { status: string }[] } } }
    ).error;
    expect(error.key).toBe('batch.atomicFailed');
    expect(error.details.results.map((result) => result.status)).toEqual(['notApplied', 'error']);
    expect((await readOne(first)).version).toBe(1);
    expect((await readOne(second)).version).toBe(1);
  });
`
    : '';

  return `  async function createOne(): Promise<string> {
    const created = await request(app.getHttpServer())
      .post('${route}/create')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ data: [${createBody}] })
      .expect(201);

    return (created.body as { data: { data: { id: string } }[] }).data[0]!.data.id;
  }

  async function readOne(id: string): Promise<Record<string, unknown>> {
    const found = await request(app.getHttpServer())
      .post('${route}/search')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ filters: [{ field: 'id', value: id }] })
      .expect(200);

    return (found.body as { data: Record<string, unknown>[] }).data[0]!;
  }

  it('reports how many entries of a batch succeeded and failed', async () => {
    const recordId = await createOne();

    const response = await request(app.getHttpServer())
      .post('${route}/update')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({
        data: [
          { id: recordId,${versionPart} ${bodyPart} },
          { id: 'missing-record',${versionPart} ${bodyPart} },
        ],
      })
      .expect(201);

    const body = response.body as {
      data: { status: string; error?: { status: number } }[];
      meta: { total: number; succeeded: number; failed: number };
    };
    expect(body.meta).toEqual({ total: 2, succeeded: 1, failed: 1 });
    expect(body.data.map((result) => result.status)).toEqual(['ok', 'error']);
    expect(body.data[1]!.error!.status).toBe(404);
  });

  it('creates every entry of an atomic batch together', async () => {
    const response = await request(app.getHttpServer())
      .post('${route}/create')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ atomic: true, data: [${createBody}, ${createBody}] })
      .expect(201);

    const body = response.body as {
      data: { status: string; data: { id: string } }[];
      meta: { total: number; succeeded: number; failed: number };
    };
    expect(body.meta).toEqual({ total: 2, succeeded: 2, failed: 0 });

    for (const result of body.data) {
      expect(result.status).toBe('ok');
      expect((await readOne(result.data.id)).id).toBe(result.data.id);
    }
  });

  it('writes nothing when an entry of an atomic batch cannot be applied', async () => {
    const recordId = await createOne();
    const before = await readOne(recordId);

    const response = await request(app.getHttpServer())
      .post('${route}/update')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({
        atomic: true,
        data: [
          { id: recordId,${versionPart} ${bodyPart} },
          { id: 'missing-record',${versionPart} ${bodyPart} },
        ],
      })
      .expect(422);

    const error = (
      response.body as {
        error: {
          key: string;
          details: {
            results: { status: string }[];
            summary: { total: number; succeeded: number; failed: number };
          };
        };
      }
    ).error;
    expect(error.key).toBe('batch.atomicFailed');
    expect(error.details.results.map((result) => result.status)).toEqual(['notApplied', 'error']);
    expect(error.details.summary).toEqual({ total: 2, succeeded: 0, failed: 1 });
    expect(await readOne(recordId)).toEqual(before);
  });
${rollbackTest}`;
}

function versionedSpecBlock(ctx: ResourceContext, createBody: string): string {
  const route = `/${ctx.pluralKebabName}/update`;

  return `  it('rejects a stale write, accepts a current one, and bumps the version each time', async () => {
    const created = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/create')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ data: [${createBody}] })
      .expect(201);

    const createdRecord = (
      created.body as { data: { status: string; data: { id: string; version: number } }[] }
    ).data[0]!.data;
    expect(createdRecord.version).toBe(1);

    type Outcome = {
      status: string;
      data?: { version: number };
      error?: { status: number; key: string; details: { expected: number; current: number | null } };
    };
    const update = async (entry: Record<string, unknown>, ifMatch?: string): Promise<Outcome> => {
      const call = request(app.getHttpServer())
        .post('${route}')
        .set('Authorization', \`Bearer \${ownerToken}\`);
      const response = await (ifMatch ? call.set('If-Match', ifMatch) : call)
        .send({ data: [{ id: createdRecord.id, ...${createBody}, ...entry }] })
        .expect(201);

      return (response.body as { data: Outcome[] }).data[0]!;
    };

    const first = await update({ version: 1 });
    expect(first).toMatchObject({ status: 'ok', data: { version: 2 } });

    const stale = await update({ version: 1 });
    expect(stale).toMatchObject({
      status: 'error',
      error: { status: 409, key: 'record.versionConflict', details: { expected: 1, current: 2 } },
    });

    const viaHeader = await update({}, '"2"');
    expect(viaHeader).toMatchObject({ status: 'ok', data: { version: 3 } });

    const staleHeader = await update({}, 'W/"2"');
    expect(staleHeader).toMatchObject({
      status: 'error',
      error: { status: 412, key: 'record.preconditionFailed', details: { expected: 2, current: 3 } },
    });

    const missing = await update({});
    expect(missing).toMatchObject({
      status: 'error',
      error: { status: 428, key: 'record.versionRequired' },
    });
  });

  it('lets exactly one of two concurrent writes at the same version through', async () => {
    const created = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/create')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ data: [${createBody}] })
      .expect(201);

    const recordId = (
      created.body as { data: { status: string; data: { id: string } }[] }
    ).data[0]!.data.id;

    const responses = await Promise.all(
      [0, 1].map(() =>
        request(app.getHttpServer())
          .post('${route}')
          .set('Authorization', \`Bearer \${ownerToken}\`)
          .send({ data: [{ id: recordId, version: 1, ...${createBody} }] }),
      ),
    );

    const statuses = responses.map(
      (response) => (response.body as { data: { status: string }[] }).data[0]!.status,
    );
    expect(statuses.filter((status) => status === 'ok')).toHaveLength(1);
    expect(statuses.filter((status) => status === 'error')).toHaveLength(1);
  });

  it('refuses an If-Match header on a request that carries several entries', async () => {
    await request(app.getHttpServer())
      .post('${route}')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .set('If-Match', '"1"')
      .send({ data: [{ id: 'a', ${createBody === '{}' ? '' : `...${createBody}`} }, { id: 'b', ${createBody === '{}' ? '' : `...${createBody}`} }] })
      .expect(400);
  });

  it('refuses a malformed If-Match header', async () => {
    await request(app.getHttpServer())
      .post('${route}')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .set('If-Match', '*')
      .send({ data: [{ id: 'a', ${createBody === '{}' ? '' : `...${createBody}`} }] })
      .expect(400);
  });
`;
}

function relationSpecBlock(ctx: ResourceContext, createBody: string): string {
  if (ctx.relations.length === 0) {
    return '';
  }

  return ctx.relations
    .map((relation) => {
      // The spec seeds children through a raw client, which is outside the
      // tenant-scoping extension, so it passes the tenant the requests below
      // run under rather than relying on a column default the schema does not
      // give it.
      const childBody = [
        `tenantId: 'default'`,
        ...relation.childRequiredFields.map(
          (field) => `${field.name}: ${sampleValueFor(field)}`,
        ),
      ].join(', ');

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

    const childA = await prisma.${relation.childDelegate}.create({ data: { ${childBody} } });
    const childB = await prisma.${relation.childDelegate}.create({ data: { ${childBody} } });

    const attached = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/update')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({
        data: [{ id: recordId,${ctx.versioned ? ' version: 1,' : ''} relations: { ${relation.relation}: { attach: [childA.id] } } }],
      })
      .expect(201);

    expect(
      (attached.body as { data: { data: { ${relation.relation}: string[] } }[] })
        .data[0]!.data.${relation.relation},
    ).toEqual([childA.id]);

    const members = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/' + recordId + '/${relation.relation}/members')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .expect(200);

    expect(
      (members.body as { data: { id: string }[] }).data.map((row) => row.id),
    ).toEqual([childA.id]);

    const options = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/' + recordId + '/${relation.relation}/options')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({})
      .expect(200);

    expect(
      (options.body as { data: { id: string }[] }).data.map((row) => row.id),
    ).toEqual(expect.arrayContaining([childA.id, childB.id]));

    const synced = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/update')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({
        data: [{ id: recordId,${ctx.versioned ? ' version: 2,' : ''} relations: { ${relation.relation}: { sync: [childB.id] } } }],
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
        data: [{ id: recordId,${ctx.versioned ? ' version: 3,' : ''} relations: { ${relation.relation}: { detach: [childB.id] } } }],
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

function translatableSpecBlock(
  ctx: ResourceContext,
  createBody: string,
): string {
  const field = translatableFields(ctx)[0];

  if (
    !field ||
    ctx.permissions.create === 'none' ||
    ctx.permissions.update === 'none'
  ) {
    return '';
  }

  const name = field.name;
  const route = ctx.pluralKebabName;
  const isFilterable = ctx.filters.includes(name);
  const isSortable = ctx.sorts.includes(name);
  const isSearchable = !field.hidden;

  return `
  describe('translatable field ${name}', () => {
    const defaultLocale = resolveDefaultLocale();
    const otherLocale = resolveSupportedLocales().find(
      (locale) => locale !== defaultLocale,
    );
    const itWithAnotherLocale = otherLocale ? it : it.skip;

    async function createWith(value: unknown): Promise<Record<string, unknown>> {
      const response = await request(app.getHttpServer())
        .post('/${route}/create')
        .set('Authorization', \`Bearer \${ownerToken}\`)
        .send({ data: [{ ...${createBody}, ${name}: value }] })
        .expect(201);

      return (
        response.body as { data: { data: Record<string, unknown> }[] }
      ).data[0]!.data;
    }

    async function searchAs(
      locale: string,
      body: Record<string, unknown>,
    ): Promise<Record<string, unknown>[]> {
      const response = await request(app.getHttpServer())
        .post('/${route}/search')
        .set('Authorization', \`Bearer \${ownerToken}\`)
        .set('Accept-Language', locale)
        .send(body)
        .expect(200);

      return (response.body as { data: Record<string, unknown>[] }).data;
    }

    it('publishes which fields are translatable and the locales it serves', async () => {
      const response = await request(app.getHttpServer())
        .get('/${route}/describe')
        .set('Authorization', \`Bearer \${ownerToken}\`)
        .expect(200);

      const body = response.body as {
        data: {
          fields: Array<{ name: string; translatable?: boolean }>;
          locales: { supported: string[]; default: string };
        };
      };
      expect(
        body.data.fields.find((entry) => entry.name === '${name}')?.translatable,
      ).toBe(true);
      expect(body.data.locales.default).toBe(defaultLocale);
      expect(body.data.locales.supported).toContain(defaultLocale);
    });

    it('writes a plain string to the locale of the request', async () => {
      const created = await createWith('plain-' + randomUUID());

      expect(created.${name}Translations).toEqual({ [defaultLocale]: created.${name} });
    });

    itWithAnotherLocale('stores several locales at once and answers in the requested one', async () => {
      const marker = randomUUID();
      const created = await createWith({
        [defaultLocale]: 'default-' + marker,
        [otherLocale!]: 'other-' + marker,
      });

      expect(created.${name}).toBe('default-' + marker);
      expect(created.${name}Translations).toEqual({
        [defaultLocale]: 'default-' + marker,
        [otherLocale!]: 'other-' + marker,
      });

      const rows = await searchAs(otherLocale!, {
        filters: [{ field: 'id', value: created.id }],
      });
      expect(rows[0]!.${name}).toBe('other-' + marker);
    });

    itWithAnotherLocale('falls back along the declared chain when a locale has no value', async () => {
      const marker = randomUUID();
      const created = await createWith({ [defaultLocale]: 'only-' + marker });

      const rows = await searchAs(otherLocale!, {
        filters: [{ field: 'id', value: created.id }],
      });
      expect(rows[0]!.${name}).toBe('only-' + marker);
    });

    itWithAnotherLocale('merges the locales of an update into the stored ones and removes a null one', async () => {
      const marker = randomUUID();
      const created = await createWith({ [defaultLocale]: 'first-' + marker });

      await request(app.getHttpServer())
        .post('/${route}/update')
        .set('Authorization', \`Bearer \${ownerToken}\`)
        .send({ data: [{ id: created.id, ${name}: { [otherLocale!]: 'second-' + marker } }] })
        .expect(201);

      const merged = await searchAs(defaultLocale, {
        filters: [{ field: 'id', value: created.id }],
      });
      expect(merged[0]!.${name}Translations).toEqual({
        [defaultLocale]: 'first-' + marker,
        [otherLocale!]: 'second-' + marker,
      });

      await request(app.getHttpServer())
        .post('/${route}/update')
        .set('Authorization', \`Bearer \${ownerToken}\`)
        .send({ data: [{ id: created.id, ${name}: { [otherLocale!]: null } }] })
        .expect(201);

      const removed = await searchAs(defaultLocale, {
        filters: [{ field: 'id', value: created.id }],
      });
      expect(removed[0]!.${name}Translations).toEqual({
        [defaultLocale]: 'first-' + marker,
      });
    });

    it('rejects a locale the project does not support', async () => {
      await request(app.getHttpServer())
        .post('/${route}/create')
        .set('Authorization', \`Bearer \${ownerToken}\`)
        .send({ data: [{ ...${createBody}, ${name}: { xx: 'nope' } }] })
        .expect(400);
    });

    it('rejects a value that breaks the field rule in any locale', async () => {
      await request(app.getHttpServer())
        .post('/${route}/create')
        .set('Authorization', \`Bearer \${ownerToken}\`)
        .send({ data: [{ ...${createBody}, ${name}: { [defaultLocale]: '' } }] })
        .expect(400);
    });
${
  isSearchable
    ? `
    itWithAnotherLocale('finds a record by text in the resolved locale only', async () => {
      const marker = randomUUID();
      const created = await createWith({
        [defaultLocale]: 'alpha-' + marker,
        [otherLocale!]: 'beta-' + marker,
      });

      const hit = await searchAs(otherLocale!, {
        search: { q: 'beta-' + marker, engine: 'prisma' },
      });
      expect(hit.map((row) => row.id)).toContain(created.id);

      const miss = await searchAs(defaultLocale, {
        search: { q: 'beta-' + marker, engine: 'prisma' },
      });
      expect(miss.map((row) => row.id)).not.toContain(created.id);
    });
`
    : ''
}${
    isFilterable
      ? `
    itWithAnotherLocale('filters on the value resolved for the request locale', async () => {
      const marker = randomUUID();
      const created = await createWith({
        [defaultLocale]: 'left-' + marker,
        [otherLocale!]: 'right-' + marker,
      });
      const filters = [{ field: '${name}', operator: '=', value: 'right-' + marker }];

      const hit = await searchAs(otherLocale!, { filters });
      expect(hit.map((row) => row.id)).toEqual([created.id]);

      const miss = await searchAs(defaultLocale, { filters });
      expect(miss).toEqual([]);
    });

    it('refuses an operator that has no meaning on translated text', async () => {
      await request(app.getHttpServer())
        .post('/${route}/search')
        .set('Authorization', \`Bearer \${ownerToken}\`)
        .send({ filters: [{ field: '${name}', operator: '>', value: 'a' }] })
        .expect(400);
    });
`
      : ''
  }${
    isSortable && isFilterable
      ? `
    it('sorts on the value resolved for the request locale', async () => {
      const marker = randomUUID();
      await createWith({ [defaultLocale]: 'b-' + marker });
      await createWith({ [defaultLocale]: 'a-' + marker });
      await createWith({ [defaultLocale]: 'c-' + marker });

      const rows = await searchAs(defaultLocale, {
        filters: [{ field: '${name}', operator: 'like', value: marker }],
        sorts: [{ field: '${name}', direction: 'desc' }],
      });
      expect(rows.map((row) => row.${name})).toEqual([
        'c-' + marker,
        'b-' + marker,
        'a-' + marker,
      ]);
    });
`
      : ''
  }  });
`;
}

function encryptedFieldTests(ctx: ResourceContext, createBody: string): string {
  return ctx.fields
    .filter((field) => field.type === 'encrypted')
    .map((field) => {
      const revealed = !field.hidden;
      const leak = revealed ? 'toContain' : 'not.toContain';
      const searchCheck =
        ctx.permissions.view === 'none'
          ? ''
          : `
    const listed = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/search')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({})
      .expect(200);
    expect(JSON.stringify(listed.body)).${leak}(secret);
`;

      return `  it('stores ${field.name} sealed and ${revealed ? 'returns it decrypted' : 'never returns it'}', async () => {
    const secret = \`${field.name}-\${randomUUID()}\`;
    const created = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/create')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ data: [{ ...${createBody}, ${field.name}: secret }] })
      .expect(201);

    expect(JSON.stringify(created.body)).${leak}(secret);
${searchCheck}
    const recordId = (
      created.body as { data: { status: string; data: { id: string } }[] }
    ).data[0]!.data.id;
    const stored = await prisma.${ctx.modelCamelName}.findUniqueOrThrow({
      where: { id: recordId },
    });
    expect(stored.${field.name}).toMatch(/^enc:/);
    expect(stored.${field.name}).not.toContain(secret);
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
  const hasRelations = ctx.relations.length > 0;
  const usesPrismaClient = hasRelations || ctx.vector !== null;

  return `import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';${usesPrismaClient ? `\nimport { PrismaPg } from '@prisma/adapter-pg';\nimport { PrismaClient } from '@prisma/client';` : ''}
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';${primarySearchField || usesPrismaClient ? `\nimport { env } from '#technical/config/env';` : ''}
import { MAX_BATCH_ENTRIES } from '#technical/http/batch';${
    translatableFields(ctx).length > 0
      ? `\nimport {
  resolveDefaultLocale,
  resolveSupportedLocales,
} from '#technical/i18n/locale.config';`
      : ''
  }
import { actingAs, registerAndLogin } from '#devtools/test-support';${vectorSpecImports(ctx)}
${usesPrismaClient ? `\nconst adapter = new PrismaPg({ connectionString: env.DATABASE_URL });\nconst prisma = new PrismaClient({ adapter });\n` : ''}${vectorSpecFixtures(ctx)}
describe('${ctx.pascalName} resource', () => {
  let app: INestApplication<App>;
  let ownerToken: string;
  let strangerToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })${vectorSpecOverride(ctx)}.compile();
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
    await app.close();${usesPrismaClient ? `\n    await prisma.$disconnect();` : ''}
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
}${canCreateAny ? encryptedFieldTests(ctx, createBody) : ''}  it('describes its fields and create/update rules for a frontend to consume', async () => {
    const response = await request(app.getHttpServer())
      .get('/${ctx.pluralKebabName}/describe')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .expect(200);

    const body = response.body as {
      data: {
        fields: Array<{ name: string }>;
        limits?: number[];
        paginated: boolean;
        softDeletes: boolean;
        relations: string[];
        rules: { create: { required?: string[] } };
      };
    };
    expect(body.data.fields.map((field) => field.name)).toEqual([
${ctx.fields.map((field) => `      '${field.name}',`).join('\n')}
    ]);
    expect(body.data.paginated).toBe(${ctx.pagination ? 'true' : 'false'});
    expect(body.data.softDeletes).toBe(${ctx.softDeletes ? 'true' : 'false'});
${ctx.versioned ? `    expect(body.data).toMatchObject({ versioned: { field: 'version', header: 'If-Match' } });\n` : ''}    expect(body.data.relations).toEqual([${ctx.relations.map((relation) => `'${relation.relation}'`).join(', ')}]);
    expect(body.data.limits).toEqual(${ctx.pagination ? `[${ctx.pagination.limits.join(', ')}]` : 'undefined'});
${
  requiredFields.length > 0
    ? `    expect(body.data.rules.create.required).toEqual([${requiredFields.map((field) => `'${field.name}'`).join(', ')}]);`
    : ''
}
  });

${scopeParityTest(ctx, createBody)}
${vectorSpecTests(ctx, createBody)}${ctx.softDeletes ? `\n${trashParityTest(ctx, createBody)}\n` : ''}
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
      .send({ capabilities: [${resolvedCapabilityKeysLiteral(ctx)}] })
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .expect(200);

    const body = response.body as {
      data: Array<{ capabilities: Record<string, { allowed: boolean }> }>;
      meta: unknown;
    };
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0]?.capabilities.update?.allowed).toBe(true);
    expect(Object.keys(body.data[0]?.capabilities ?? {}).sort()).toEqual([${resolvedCapabilityKeysLiteral(ctx, true)}]);
    expect(body.meta).toMatchObject({
      capabilities: { create: { allowed: true, scope: '${ctx.permissions.create}' } },
      channels: ['${ctx.camelName}'],
    });${
      ctx.softDeletes
        ? `
    expect(
      (body.meta as { capabilities: Record<string, unknown> }).capabilities,
    ).toHaveProperty('listTrashed');`
        : ''
    }
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

${bulkSpecBlock(ctx, createBody)}
${ctx.versioned ? `${versionedSpecBlock(ctx, createBody)}\n` : ''}`
      : ''
  }${
    !(canCreateAny && canDeleteAny)
      ? ''
      : !ctx.softDeletes
        ? `${hardDeleteOnlySpec(ctx, createBody)}
`
        : `${softDeleteVisibilitySpec(ctx, createBody)}
  it('soft-deletes then restores a record', async () => {
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
  }  it('never lets a different tenant see this tenant records', async () => {
    const outsider = await actingAs(app, {
      tenantId: \`tenant-\${randomUUID()}\`,
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

${paginationSpec(ctx, createBody)}

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

  it('rejects a batch larger than the framework allows in one call', async () => {
    await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/create')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({
        data: Array.from({ length: MAX_BATCH_ENTRIES + 1 }, () => (${createBody})),
      })
      .expect(400);
  });

  it('rejects a search carrying more filters than the framework allows', async () => {
    await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/search')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({
        filters: Array.from({ length: 51 }, () => ({
          field: 'id',
          value: 'none',
        })),
      })
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

    // Every engine caps its results at some default of its own, so a search
    // says which cap applied and whether it was reached -- a total taken from
    // a truncated match set is a floor, and the caller has to be able to tell.
    expect(
      (found.body as { meta: { search: unknown } }).meta.search,
    ).toEqual({ matchLimit: env.SEARCH_MATCH_LIMIT, truncated: false });
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
}${canCreateAny ? workflowSpecBlock(ctx, createBody) : ''}${relationSpecBlock(ctx, createBody)}${translatableSpecBlock(ctx, createBody)}});
`;
}

export function viewFile(ctx: ResourceContext): string {
  const hiddenFields = ctx.fields.filter((field) => field.hidden);
  const visibleFields = ctx.fields.filter((field) => !field.hidden);
  const visibleTranslatable = visibleFields.filter(
    (field) => field.translatable,
  );
  const translatableImport =
    visibleTranslatable.length > 0
      ? `import { withResolvedTranslations } from '#technical/i18n/translatable';\n`
      : '';
  const translatableNames = `[${visibleTranslatable.map((field) => `'${field.name}'`).join(', ')}]`;
  const parseInput = (source: string): string =>
    visibleTranslatable.length > 0
      ? `withResolvedTranslations(${source}, ${translatableNames})`
      : source;

  const visibleFieldLines = visibleFields
    .map((field) =>
      field.translatable
        ? `  ${field.name}: z.string().nullable(),\n  ${field.name}Translations: z.record(z.string(), z.string()),`
        : `  ${field.name}: ${zodOutputTypeFor(field)},`,
    )
    .join('\n');

  const schema = `export const ${ctx.camelName}ViewSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  ownerId: z.string(),${ownedByTeam(ctx) ? `\n  teamId: z.string(),` : ''}
${visibleFieldLines}
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),${ctx.softDeletes ? `\n  deletedAt: z.coerce.date().nullable(),` : ''}${ctx.versioned ? `\n  version: z.number().int(),` : ''}${ctx.workflow ? `\n  ${ctx.workflow.field}: z.string(),` : ''}
});
export type ${ctx.pascalName}View = z.infer<typeof ${ctx.camelName}ViewSchema>;
`;

  if (hiddenFields.length === 0) {
    return `import { z } from 'zod';
import type { ${ctx.modelPascalName} } from '@prisma/client';
${translatableImport}
${schema}
export function to${ctx.pascalName}View(record: ${ctx.modelPascalName}): ${ctx.pascalName}View {
  return ${ctx.camelName}ViewSchema.parse(${parseInput('record')});
}
`;
  }

  const hiddenNames = hiddenFields.map((field) => field.name).join(', ');

  return `import { z } from 'zod';
import type { ${ctx.modelPascalName} } from '@prisma/client';
${translatableImport}
${schema}
export function to${ctx.pascalName}View(record: ${ctx.modelPascalName}): ${ctx.pascalName}View {
  const { ${hiddenNames}, ...view } = record;
  return ${ctx.camelName}ViewSchema.parse(${parseInput('view')});
}
`;
}

export function factoryFile(ctx: ResourceContext): string {
  const overrideLines = ctx.fields
    .map((field) => `  ${field.name}?: ${storedTsTypeFor(field)};`)
    .join('\n');

  const buildLines = ctx.fields
    .map(
      (field) =>
        `    ${field.name}: overrides.${field.name} ?? ${fakerValueFor(field)},`,
    )
    .join('\n');

  return `import { faker } from '@faker-js/faker';${translatableFields(ctx).length > 0 ? `\nimport { resolveDefaultLocale } from '#technical/i18n/locale.config';` : ''}

export interface ${ctx.pascalName}FactoryOverrides {
  ownerId: string;${ownedByTeam(ctx) ? '\n  teamId: string;' : ''}
  tenantId?: string;
${overrideLines}${ctx.softDeletes ? '\n  trashed?: boolean;' : ''}
}

export interface ${ctx.pascalName}FactoryOptions {
  count?: number;
}

function build${ctx.pascalName}(overrides: ${ctx.pascalName}FactoryOverrides) {
  return {
${buildLines}
    ownerId: overrides.ownerId,${ownedByTeam(ctx) ? '\n    teamId: overrides.teamId,' : ''}
    ...(overrides.tenantId ? { tenantId: overrides.tenantId } : {}),${ctx.softDeletes ? `\n    deletedAt: overrides.trashed ? new Date() : null,` : ''}
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
  const vectorLine = ctx.vector
    ? `\n  ${ctx.vector.name} Unsupported("vector(${ctx.vector.dimensions})")?`
    : '';

  return `
model ${ctx.pascalName} {
  id        String    @id @default(cuid())
  tenantId  String
  ownerId   String${ownedByTeam(ctx) ? `\n  teamId    String` : ''}
${customFieldLines}${vectorLine}
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt${ctx.softDeletes ? `\n  deletedAt DateTime?` : ''}${ctx.versioned ? `\n  version   Int       @default(1)` : ''}${ctx.workflow ? `\n  ${ctx.workflow.field.padEnd(9)} String    @default("${ctx.workflow.initial}")` : ''}

  owner User @relation(fields: [ownerId], references: [id])${ownedByTeam(ctx) ? `\n  team  Team @relation(fields: [teamId], references: [id])` : ''}

  @@index([tenantId])${
    ctx.softDeletes
      ? `
  // Every default read filters on these two together, so the composite keeps
  // the "not deleted" clause from scanning the whole tenant.
  @@index([tenantId, deletedAt])`
      : ''
  }
}
`;
}
