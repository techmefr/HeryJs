import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { z } from 'zod';
import { camelCase, kebabCase } from './naming';

export const permissionPresetSchema = z.enum(['own', 'team', 'all', 'none']);

export const blueprintFieldSchema = z.object({
  name: z.string().regex(/^[a-z][a-zA-Z0-9]*$/),
  type: z.enum(['string', 'int', 'boolean', 'datetime']),
  optional: z.boolean().default(false),
  hidden: z.boolean().default(false),
});

const fieldNameSchema = z.string().regex(/^[a-z][a-zA-Z0-9]*$/);
const resourceNameSchema = z.string().regex(/^[A-Z][a-zA-Z0-9]*$/);

// A relation link names the resource on the other end and how its rows tie
// back to this one. hasMany is a real Prisma relation: foreignKey is the
// column the related model uses to point back here. morphMany has no
// Prisma-level relation at all -- Prisma does not model polymorphic
// associations -- so the related model's own discriminator column and the
// value it holds for *this* resource have to be declared, there is nothing
// to introspect from the schema.
export const blueprintRelationLinkSchema = z
  .object({
    relation: fieldNameSchema,
    resource: resourceNameSchema,
    type: z.enum(['hasMany', 'morphMany']),
    foreignKey: fieldNameSchema,
    discriminator: fieldNameSchema.optional(),
    discriminatorValue: z.string().optional(),
  })
  .refine(
    (link) =>
      link.type === 'hasMany' ||
      (link.discriminator !== undefined &&
        link.discriminatorValue !== undefined),
    {
      message:
        'a morphMany link needs both discriminator and discriminatorValue',
    },
  );

export type BlueprintRelationLink = z.infer<typeof blueprintRelationLinkSchema>;

// belongsToMany is the one relation shape hasMany/morphMany cannot express:
// neither side owns the other, so attaching or detaching never touches the
// related row itself, only a row in the pivot table -- foreignKey/relatedKey
// are that pivot's two columns, pointing at this resource and the referenced
// one respectively.
export const blueprintMutableRelationSchema = z.object({
  relation: fieldNameSchema,
  resource: resourceNameSchema,
  pivotTable: resourceNameSchema,
  foreignKey: fieldNameSchema,
  relatedKey: fieldNameSchema,
});

export type BlueprintMutableRelation = z.infer<
  typeof blueprintMutableRelationSchema
>;

export const blueprintSchema = z.object({
  name: z.string().regex(/^[A-Z][a-zA-Z0-9]*$/),
  // A resource the generator never routes: no controller, no service, no
  // capabilities of its own. Its only job is to be pointed at from another
  // blueprint's includes/aggregates, so its own fields/filters/sorts describe
  // the relation once instead of being retyped by hand on every parent that
  // includes it.
  routed: z.boolean().default(true),
  fields: z.array(blueprintFieldSchema).default([]),
  permissions: z
    .object({
      view: permissionPresetSchema.default('own'),
      create: permissionPresetSchema.default('own'),
      update: permissionPresetSchema.default('own'),
      delete: permissionPresetSchema.default('own'),
    })
    .default({ view: 'own', create: 'own', update: 'own', delete: 'own' }),
  pagination: z
    .object({
      limits: z.array(z.number().int().positive()).default([10, 15, 20]),
      default: z.number().int().positive().default(15),
    })
    .default({ limits: [10, 15, 20], default: 15 }),
  sorts: z
    .array(z.string().regex(/^[a-z][a-zA-Z0-9]*$/))
    .default(['createdAt']),
  filters: z.array(z.string().regex(/^[a-z][a-zA-Z0-9]*$/)).default([]),
  includes: z.array(blueprintRelationLinkSchema).default([]),
  aggregates: z.array(blueprintRelationLinkSchema).default([]),
  relations: z.array(blueprintMutableRelationSchema).default([]),
});

type RawBlueprint = z.infer<typeof blueprintSchema>;

// What an include contract needs at runtime: the client-facing allow-lists a
// nested filters/sorts/selects request is validated against, derived from
// the referenced resource's own blueprint rather than retyped here.
export interface ResolvedInclude extends BlueprintRelationLink {
  filters: readonly string[];
  sorts: readonly string[];
  selects: readonly string[];
}

// Aggregates validate a `field` (for avg/sum/min/max) against the referenced
// resource's own numeric fields, and a `filters` allow-list like includes do.
export interface ResolvedAggregate extends BlueprintRelationLink {
  filters: readonly string[];
  fields: readonly string[];
}

// Resolved the same way includes/aggregates derive childDelegate from the
// referenced resource's name -- pivotDelegate is the Prisma model name for
// pivotTable, camelCased the same way Prisma's own generated client property
// names are.
export interface ResolvedMutableRelation extends BlueprintMutableRelation {
  childDelegate: string;
  pivotDelegate: string;
  // The referenced resource's required fields, so a generated spec can seed a
  // row to attach without knowing anything about that resource beyond its name.
  childRequiredFields: BlueprintField[];
}

export type PermissionPreset = z.infer<typeof permissionPresetSchema>;
export type BlueprintField = z.infer<typeof blueprintFieldSchema>;

export interface Blueprint extends Omit<
  RawBlueprint,
  'includes' | 'aggregates' | 'relations'
> {
  includes: ResolvedInclude[];
  aggregates: ResolvedAggregate[];
  relations: ResolvedMutableRelation[];
}

// Columns the generator owns. A blueprint declaring one of them would put a
// client-writable field on top of a column the framework decides, which is how
// a caller ends up choosing its own owner or team. Only applies to routed
// resources -- an unrouted one gets none of that scaffolding, so it declares
// every column it has, audit timestamps included.
const RESERVED_FIELDS = new Set([
  'id',
  'tenantId',
  'ownerId',
  'teamId',
  'createdAt',
  'updatedAt',
  'deletedAt',
]);

function assertNoReservedField(
  blueprint: RawBlueprint,
  report: (message: string) => void,
): void {
  if (!blueprint.routed) {
    return;
  }

  for (const field of blueprint.fields) {
    if (RESERVED_FIELDS.has(field.name)) {
      report(
        `field "${field.name}" is generated by hery and must not be declared`,
      );
    }
  }
}

// The columns a sort or filter entry may name beyond the blueprint's own
// fields -- every generated column except tenantId, which multi-tenancy
// already applies ahead of anything a caller can request. Only extended for
// routed resources: an unrouted one has none of these generated columns, so
// only its own declared fields (plus the always-implicit id) are valid.
const KNOWN_NON_FIELD_SORT_FILTER_TARGETS = new Set([
  'id',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'ownerId',
  'teamId',
]);

/**
 * Both arrays are interpolated unescaped into generated TypeScript and used
 * as raw Prisma `orderBy`/`where` keys, so an entry that names nothing real
 * is not a "no rows" query -- it is a controller that fails to compile, or a
 * 500 on the search route the moment it is called.
 */
function assertSortsAndFiltersAreKnownFields(
  blueprint: RawBlueprint,
  report: (message: string) => void,
): void {
  const fieldNames = new Set(blueprint.fields.map((field) => field.name));
  const knownTargets = blueprint.routed
    ? KNOWN_NON_FIELD_SORT_FILTER_TARGETS
    : new Set(['id']);

  for (const [kind, entries] of [
    ['sort', blueprint.sorts],
    ['filter', blueprint.filters],
  ] as const) {
    for (const entry of entries) {
      if (!fieldNames.has(entry) && !knownTargets.has(entry)) {
        report(`${kind} "${entry}" names no declared field`);
      }
    }
  }
}

/**
 * A relation named twice in `includes`, or twice in `aggregates`, is not two
 * different things a client can ask for -- both would generate the same
 * contract entry, so the second declaration is dead weight at best and a
 * silent surprise at worst if the two ever disagree.
 */
function assertRelationsAreUnique(
  blueprint: RawBlueprint,
  report: (message: string) => void,
): void {
  for (const [kind, entries] of [
    ['include', blueprint.includes.map((entry) => entry.relation)],
    ['aggregate', blueprint.aggregates.map((entry) => entry.relation)],
    ['relation', blueprint.relations.map((entry) => entry.relation)],
  ] as const) {
    const seen = new Set<string>();

    for (const relation of entries) {
      if (seen.has(relation)) {
        report(`relation "${relation}" is declared more than once in ${kind}s`);
      }
      seen.add(relation);
    }
  }
}

/**
 * Accepts either a blueprint name, resolved under `blueprints/`, or a path to a
 * YAML file. A name is the everyday case; a path is what makes a blueprint
 * usable where it makes sense to keep it, next to what it produced.
 */
export function resolveBlueprintPath(root: string, nameOrPath: string): string {
  const looksLikePath =
    /\.ya?ml$/.test(nameOrPath) ||
    nameOrPath.includes('/') ||
    nameOrPath.includes(path.sep);

  return looksLikePath
    ? path.resolve(root, nameOrPath)
    : path.join(root, 'blueprints', `${kebabCase(nameOrPath)}.yaml`);
}

/**
 * A relation's target blueprint lives next to the one referencing it -- both
 * are part of the same project's blueprint directory, so there is no
 * separate root to resolve against here the way `resolveBlueprintPath` needs
 * one for the CLI's own name-to-file lookup.
 */
function loadReferencedBlueprint(
  resource: string,
  dir: string,
  problems: string[],
): Blueprint | undefined {
  const file = path.join(dir, `${kebabCase(resource)}.yaml`);

  if (!existsSync(file)) {
    problems.push(`resource "${resource}" has no blueprint at ${file}`);
    return undefined;
  }

  const referenced = loadBlueprint(file);

  // v1 scope: only a resource with no routes of its own can be an include or
  // aggregate target. Pointing at a fully routed CRUD resource raises real
  // questions this framework has not answered yet -- does the caller need the
  // target's own view permission, does its own capability set apply -- so it
  // is refused rather than guessed at.
  if (referenced.routed) {
    problems.push(
      `resource "${resource}" is routed and cannot be an include/aggregate target yet`,
    );
    return undefined;
  }

  return referenced;
}

function resolveRelationLinks(
  blueprint: RawBlueprint,
  dir: string,
  problems: string[],
): { includes: ResolvedInclude[]; aggregates: ResolvedAggregate[] } {
  const includes: ResolvedInclude[] = [];
  const aggregates: ResolvedAggregate[] = [];

  for (const link of blueprint.includes) {
    const referenced = loadReferencedBlueprint(link.resource, dir, problems);
    if (!referenced) {
      continue;
    }

    includes.push({
      ...link,
      filters: referenced.filters,
      sorts: referenced.sorts,
      selects: [
        'id',
        ...referenced.fields
          .filter((field) => !field.hidden)
          .map((field) => field.name),
      ],
    });
  }

  for (const link of blueprint.aggregates) {
    const referenced = loadReferencedBlueprint(link.resource, dir, problems);
    if (!referenced) {
      continue;
    }

    aggregates.push({
      ...link,
      filters: referenced.filters,
      fields: referenced.fields
        .filter((field) => field.type === 'int' && !field.hidden)
        .map((field) => field.name),
    });
  }

  return { includes, aggregates };
}

function resolveMutableRelations(
  blueprint: RawBlueprint,
  dir: string,
  problems: string[],
): ResolvedMutableRelation[] {
  const relations: ResolvedMutableRelation[] = [];

  for (const link of blueprint.relations) {
    const referenced = loadReferencedBlueprint(link.resource, dir, problems);
    if (!referenced) {
      continue;
    }

    relations.push({
      ...link,
      childDelegate: camelCase(link.resource),
      pivotDelegate: camelCase(link.pivotTable),
      childRequiredFields: referenced.fields.filter((field) => !field.optional),
    });
  }

  return relations;
}

export function loadBlueprint(filePath: string): Blueprint {
  const raw = yaml.load(readFileSync(filePath, 'utf8'));
  const blueprint = blueprintSchema.parse(raw);
  const problems: string[] = [];

  assertNoReservedField(blueprint, (message) => problems.push(message));
  assertSortsAndFiltersAreKnownFields(blueprint, (message) =>
    problems.push(message),
  );
  assertRelationsAreUnique(blueprint, (message) => problems.push(message));

  const { includes, aggregates } = resolveRelationLinks(
    blueprint,
    path.dirname(filePath),
    problems,
  );
  const relations = resolveMutableRelations(
    blueprint,
    path.dirname(filePath),
    problems,
  );

  if (problems.length > 0) {
    throw new Error(
      `Incoherent blueprint ${filePath}:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`,
    );
  }

  return { ...blueprint, includes, aggregates, relations };
}
