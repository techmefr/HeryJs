import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { z } from 'zod';
import { camelCase, kebabCase, pascalCase } from './naming';

export const permissionPresetSchema = z.enum(['own', 'team', 'all', 'none']);

export const VECTOR_MAX_DIMENSIONS = 16000;

// A `vector` field is not data a client sends or reads: it is the embedding of
// another string field of the same resource, written by a queued job and read
// only by the similarity search. `dimensions` is the column's declared width
// and `source` is the string field whose text gets embedded.
export const blueprintFieldSchema = z.strictObject({
  name: z.string().regex(/^[a-z][a-zA-Z0-9]*$/),
  type: z.enum([
    'string',
    'int',
    'boolean',
    'datetime',
    'file',
    'encrypted',
    'vector',
  ]),
  optional: z.boolean().default(false),
  hidden: z.boolean().default(false),
  translatable: z.boolean().default(false),
  reveal: z.boolean().default(false),
  // Marks the field as personal data: an anonymising erasure rewrites it, and
  // leaves the resource's other fields as they were. Every field is exported
  // either way.
  personal: z.boolean().default(false),
  dimensions: z.number().int().positive().max(VECTOR_MAX_DIMENSIONS).optional(),
  source: z
    .string()
    .regex(/^[a-z][a-zA-Z0-9]*$/)
    .optional(),
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
  .strictObject({
    relation: fieldNameSchema,
    resource: resourceNameSchema,
    type: z.enum(['hasMany', 'morphMany']),
    // Optional on a morphMany whose target declares `morph`: the child names
    // the pair once and every parent inherits it. Still required on a hasMany,
    // which has a real Prisma relation and no child-side declaration.
    foreignKey: fieldNameSchema.optional(),
    discriminator: fieldNameSchema.optional(),
    discriminatorValue: z.string().optional(),
    // Opts an include into its own collection route, scoped to the parent --
    // `POST /<parent>/:id/<relation>/search` -- on top of being reachable as
    // a nested include. Meaningless on an aggregate: there is no collection
    // for an aggregate result to page through.
    ownRoute: z.boolean().default(false),
  })
  .refine(
    (link) => link.type === 'morphMany' || link.foreignKey !== undefined,
    {
      message: 'a hasMany link needs a foreignKey',
    },
  )
  .refine((link) => !link.ownRoute || link.type === 'hasMany', {
    message: 'ownRoute needs a real Prisma relation, only hasMany has one',
  });

export type BlueprintRelationLink = z.infer<typeof blueprintRelationLinkSchema>;

// belongsToMany is the one relation shape hasMany/morphMany cannot express:
// neither side owns the other, so attaching or detaching never touches the
// related row itself, only a row in the pivot table -- foreignKey/relatedKey
// are that pivot's two columns, pointing at this resource and the referenced
// one respectively.
export const blueprintMutableRelationSchema = z.strictObject({
  relation: fieldNameSchema,
  resource: resourceNameSchema,
  pivotTable: resourceNameSchema,
  foreignKey: fieldNameSchema,
  relatedKey: fieldNameSchema,
});

export type BlueprintMutableRelation = z.infer<
  typeof blueprintMutableRelationSchema
>;

/**
 * Strict, all the way down. Zod drops an unrecognised key by default, so
 * `pagintaion:` or a misspelled `defualt:` inside it parsed cleanly, fell back
 * to the schema's defaults, and generated a resource that looked like it
 * should paginate and silently did not. None of the coherence checks below
 * could catch it either: they run on the already-stripped object, where the
 * typo no longer exists.
 *
 * A blueprint is small and hand-written. Refusing a key nobody meant to write
 * costs an author one corrected line; accepting it costs them an afternoon
 * wondering why the generated resource ignores what they declared.
 */
export const blueprintSchema = z.strictObject({
  name: z.string().regex(/^[A-Z][a-zA-Z0-9]*$/),
  // A resource the generator never routes: no controller, no service, no
  // capabilities of its own. Its only job is to be pointed at from another
  // blueprint's includes/aggregates, so its own fields/filters/sorts describe
  // the relation once instead of being retyped by hand on every parent that
  // includes it.
  routed: z.boolean().default(true),
  /**
   * Declared by the child of a polymorphic relation, once, and inherited by
   * every parent that points at it: `morph: commentable` means the columns are
   * `commentableId` and `commentableType`, and each parent's discriminator
   * value is its own name.
   *
   * It exists because the alternative is four lines of bookkeeping repeated in
   * every parent, and the repeated `discriminatorValue` is the one that goes
   * wrong -- it is always the parent's own name, so a copy-paste that keeps the
   * previous parent's value is both silent and wrong.
   */
  morph: fieldNameSchema.optional(),
  /**
   * Which major version of this resource's contract these routes serve. 1 --
   * the default -- keeps the unprefixed path every existing project already
   * publishes; anything higher mounts under /v<n>/.
   */
  version: z.number().int().positive().default(1),
  /**
   * The Prisma model these routes read and write, when it is not this
   * resource's own name. A second version of a contract is a second resource
   * over the *same* table: without this it would declare a model of its own
   * and the generator would emit a duplicate of a table that already exists.
   */
  model: z
    .string()
    .regex(/^[A-Z][a-zA-Z0-9]*$/)
    .optional(),
  // Opt-out, not opt-in, and left optional rather than defaulted so an author
  // who never wrote the key can be told apart from one who wrote `true`: a
  // resource that says nothing gets soft deletes, and declaring the key at all
  // on an unrouted resource is refused below rather than silently ignored.
  // Turning it off makes DELETE remove the row, which is why it has to be
  // written down on purpose.
  softDeletes: z.boolean().optional(),
  versioned: z.boolean().default(false),
  // Off unless written: every write to the resource stores a snapshot, and the
  // generated resource gains routes to read, diff and restore them.
  history: z.boolean().default(false),
  // Off by default. On, the resource can be shared record by record with a user
  // or a team (read or write), on top of its permission presets.
  sharing: z.boolean().default(false),
  /**
   * How the resource answers a privacy request, and the only way it opts in: a
   * resource that does not declare it is never exported nor erased, and says
   * nothing about its rows. `delete` removes every row a user owns;
   * `anonymise` keeps the rows and rewrites the fields marked `personal`, for
   * a resource other rows still point at.
   */
  erasure: z.enum(['delete', 'anonymise']).optional(),
  fields: z.array(blueprintFieldSchema).default([]),
  permissions: z
    .strictObject({
      view: permissionPresetSchema.default('own'),
      create: permissionPresetSchema.default('own'),
      update: permissionPresetSchema.default('own'),
      delete: permissionPresetSchema.default('own'),
    })
    .default({ view: 'own', create: 'own', update: 'own', delete: 'own' }),
  // Absent on purpose rather than defaulted: pagination is the developer's
  // call. Declare it and the search route paginates by exactly these rules --
  // the only accepted page sizes, and the one it uses when the caller names
  // none. Leave it out and the route does not paginate at all, and says so in
  // its own contract instead of quietly capping a result set nobody asked it
  // to cap.
  pagination: z
    .strictObject({
      limits: z.array(z.number().int().positive()).default([10, 15, 20]),
      default: z.number().int().positive().default(15),
    })
    .optional(),
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
  // Required here even though the link may omit it: resolution derives it from
  // the child's own `morph` declaration, so everything downstream can rely on
  // it being present.
  foreignKey: string;
  filters: readonly string[];
  sorts: readonly string[];
  selects: readonly string[];
  // One level only, and only for a hasMany link: the referenced blueprint's
  // own includes, stripped of anything they might nest further into. A
  // morphMany link never gets one -- it has no Prisma relation for a nested
  // `include` to compose into, see list-query.ts's buildIncludeClause.
  includes?: readonly ResolvedInclude[];
  // The referenced blueprint's own pagination, carried along the same way
  // filters/sorts/selects already are. Only read when ownRoute is set --
  // the parent-scoped route pages exactly the way the child's own blueprint
  // says it should, absent meaning "every match" like any other resource.
  pagination?: RawBlueprint['pagination'];
}

// Aggregates validate a `field` (for avg/sum/min/max) against the referenced
// resource's own numeric fields, and a `filters` allow-list like includes do.
export interface ResolvedAggregate extends BlueprintRelationLink {
  foreignKey: string;
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
  childRequiredFields: ScalarBlueprintField[];
  childFields: string[];
  childSearchFields: string[];
}

export type PermissionPreset = z.infer<typeof permissionPresetSchema>;
export type BlueprintField = z.infer<typeof blueprintFieldSchema>;
export type ScalarFieldType = Exclude<BlueprintField['type'], 'vector'>;
export type ScalarBlueprintField = BlueprintField & { type: ScalarFieldType };
export type VectorBlueprintField = BlueprintField & {
  type: 'vector';
  dimensions: number;
  source: string;
};

export function isScalarField(
  field: BlueprintField,
): field is ScalarBlueprintField {
  return field.type !== 'vector';
}

export function isVectorField(
  field: BlueprintField,
): field is VectorBlueprintField {
  return (
    field.type === 'vector' &&
    field.dimensions !== undefined &&
    field.source !== undefined
  );
}

export interface Blueprint extends Omit<
  RawBlueprint,
  'includes' | 'aggregates' | 'relations' | 'softDeletes'
> {
  // Resolved, never optional past this point: every template branches on it,
  // and an `undefined` reaching one of them would generate a resource whose
  // delete is destructive because a key was absent.
  softDeletes: boolean;
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
  const fieldNames = new Set(
    blueprint.fields
      .filter((field) => field.type !== 'vector')
      .map((field) => field.name),
  );
  const vectorNames = new Set(
    blueprint.fields
      .filter((field) => field.type === 'vector')
      .map((field) => field.name),
  );
  const knownTargets = blueprint.routed
    ? new Set([
        ...KNOWN_NON_FIELD_SORT_FILTER_TARGETS,
        ...(blueprint.versioned ? ['version'] : []),
      ])
    : new Set(['id']);

  for (const [kind, entries] of [
    ['sort', blueprint.sorts],
    ['filter', blueprint.filters],
  ] as const) {
    for (const entry of entries) {
      if (vectorNames.has(entry)) {
        report(
          `${kind} "${entry}" names a vector field, which is searched with mode: similar and cannot be ${kind === 'sort' ? 'sorted' : 'filtered'} on`,
        );
        continue;
      }

      if (!fieldNames.has(entry) && !knownTargets.has(entry)) {
        report(`${kind} "${entry}" names no declared field`);
      }
    }
  }
}

function assertEncryptedFieldsAreCoherent(
  blueprint: RawBlueprint,
  report: (message: string) => void,
): void {
  const encrypted = new Set(
    blueprint.fields
      .filter((field) => field.type === 'encrypted')
      .map((field) => field.name),
  );

  for (const field of blueprint.fields) {
    if (field.reveal && field.type !== 'encrypted') {
      report(`field "${field.name}" sets reveal but is not encrypted`);
    }

    if (field.reveal && field.hidden) {
      report(`field "${field.name}" cannot be both hidden and revealed`);
    }
  }

  for (const [kind, entries] of [
    ['sort', blueprint.sorts],
    ['filter', blueprint.filters],
  ] as const) {
    for (const entry of entries) {
      if (encrypted.has(entry)) {
        report(
          `${kind} "${entry}" names an encrypted field, and a comparison of ciphertext says nothing about the secret`,
        );
      }
    }
  }
}

function concealEncryptedFields(blueprint: RawBlueprint): BlueprintField[] {
  return blueprint.fields.map((field) =>
    field.type === 'encrypted' && !field.reveal
      ? { ...field, hidden: true }
      : field,
  );
}

/**
 * A vector field is a derived column with a lot of ways to be written down
 * wrong, and every one of them generates something that compiles: a width
 * missing, a source that is not text, two embeddings on one resource (which
 * `mode: similar` could not tell apart), or a field marked optional/hidden as
 * if the client ever saw it. Each is refused here instead.
 */
function assertVectorFieldsAreCoherent(
  blueprint: RawBlueprint,
  report: (message: string) => void,
): void {
  const vectors = blueprint.fields.filter((field) => field.type === 'vector');

  for (const field of blueprint.fields) {
    if (field.type !== 'vector') {
      if (field.dimensions !== undefined || field.source !== undefined) {
        report(
          `field "${field.name}" declares dimensions/source, which only apply to a vector field`,
        );
      }
      continue;
    }

    if (field.dimensions === undefined) {
      report(`vector field "${field.name}" needs dimensions`);
    }

    if (field.optional || field.hidden) {
      report(
        `vector field "${field.name}" is always optional and never returned, so optional/hidden must not be declared`,
      );
    }

    const source = blueprint.fields.find(
      (candidate) => candidate.name === field.source,
    );

    if (!source || source.type !== 'string') {
      report(
        `vector field "${field.name}" needs a source naming a declared string field`,
      );
    }
  }

  if (vectors.length > 1) {
    report(
      `only one vector field is supported per resource, found ${vectors.map((field) => `"${field.name}"`).join(', ')}`,
    );
  }

  if (vectors.length > 0 && !blueprint.routed) {
    report(
      'a vector field needs a routed resource: an unrouted one has no service to embed on write and no search route to query it',
    );
  }
}

/**
 * A translatable field is stored as one JSON object per locale, which only a
 * string has a meaning for, and which only a routed resource's generated view,
 * service and search know how to read back: an unrouted one is reached through
 * another resource's raw include, where the JSON would come out untranslated.
 */
function assertTranslatableIsCoherent(
  blueprint: RawBlueprint,
  report: (message: string) => void,
): void {
  for (const field of blueprint.fields) {
    if (!field.translatable) {
      continue;
    }

    if (field.type !== 'string') {
      report(
        `field "${field.name}" is translatable, which only applies to a string field`,
      );
    }

    if (!blueprint.routed) {
      report(
        `field "${field.name}" is translatable, which only applies to a routed resource`,
      );
    }
  }
}

/**
 * A privacy request finds a user's rows through the `ownerId` the generator
 * adds, so only a routed resource can take part. Beyond that the two halves of
 * the declaration have to agree: `personal` means nothing unless the rows are
 * kept and rewritten, and an anonymising erasure with nothing marked personal
 * would claim to erase while rewriting nothing.
 */
function assertErasureIsCoherent(
  blueprint: RawBlueprint,
  report: (message: string) => void,
): void {
  const personal = blueprint.fields.filter((field) => field.personal);

  if (blueprint.erasure !== undefined && !blueprint.routed) {
    report(
      'erasure only applies to a routed resource: an unrouted one has no ownerId to find the rows of a user by',
    );
  }

  if (blueprint.erasure === undefined && personal.length > 0) {
    report(
      `field ${personal.map((field) => `"${field.name}"`).join(', ')} is personal, which needs the blueprint to declare an erasure`,
    );
  }

  if (blueprint.erasure === 'delete' && personal.length > 0) {
    report(
      'personal fields only apply to erasure: anonymise -- a delete removes the whole row, so there is nothing to single out',
    );
  }

  if (blueprint.erasure === 'anonymise' && personal.length === 0) {
    report(
      'erasure: anonymise needs at least one personal field to rewrite, or use erasure: delete',
    );
  }

  for (const field of blueprint.fields) {
    if (field.personal && field.type === 'vector') {
      report(
        `vector field "${field.name}" cannot be personal: it is derived from its source, so mark the source`,
      );
    }
  }

  const vector = blueprint.fields.find((field) => field.type === 'vector');
  const source = blueprint.fields.find(
    (field) => field.name === vector?.source,
  );

  if (blueprint.erasure === 'anonymise' && source?.personal) {
    report(
      `field "${source.name}" is personal and feeds the embedding "${vector?.name}", which an anonymising erasure would leave behind -- use erasure: delete`,
    );
  }
}

/**
 * Soft deletes are on unless a routed blueprint says otherwise, so `undefined`
 * and `true` mean the same thing everywhere past `loadBlueprint`.
 */
function softDeletesEnabled(blueprint: RawBlueprint): boolean {
  return blueprint.softDeletes ?? true;
}

/**
 * Two ways to write the key that would not mean what the author expects. An
 * unrouted resource has no generated columns at all -- no controller, no
 * delete route, no `deletedAt` -- so `softDeletes` there reads as a decision
 * that was in fact never applied. And a sort or filter naming `deletedAt` on a
 * resource that opted out names a column the generated Prisma model does not
 * have, which is a 500 on the search route rather than an empty result.
 */
function assertSoftDeletesIsCoherent(
  blueprint: RawBlueprint,
  report: (message: string) => void,
): void {
  if (blueprint.softDeletes !== undefined && !blueprint.routed) {
    report(
      'softDeletes only applies to a routed resource: an unrouted one has no delete route and no deletedAt column to turn off',
    );
  }

  if (softDeletesEnabled(blueprint)) {
    return;
  }

  for (const [kind, entries] of [
    ['sort', blueprint.sorts],
    ['filter', blueprint.filters],
  ] as const) {
    if (entries.includes('deletedAt')) {
      report(
        `${kind} "deletedAt" needs softDeletes, which this blueprint turns off`,
      );
    }
  }
}

function assertSharingIsCoherent(
  blueprint: RawBlueprint,
  report: (message: string) => void,
): void {
  if (blueprint.sharing && !blueprint.routed) {
    report(
      'sharing only applies to a routed resource: an unrouted one has no routes to grant or revoke a share on',
    );
  }

  if (
    blueprint.sharing &&
    blueprint.fields.some((field) => field.type === 'vector')
  ) {
    report(
      'sharing cannot be combined with a vector field yet: similarity ranking runs in SQL against the view scope, which does not carry the shared ids',
    );
  }
}

function assertVersionedIsCoherent(
  blueprint: RawBlueprint,
  report: (message: string) => void,
): void {
  if (blueprint.versioned && !blueprint.routed) {
    report(
      'versioned only applies to a routed resource: an unrouted one has no update route to check a version on',
    );
  }

  if (
    blueprint.versioned &&
    blueprint.fields.some((field) => field.name === 'version')
  ) {
    report(
      'field "version" is the column versioned: true adds, so it cannot also be declared as a field',
    );
  }
}

function assertHistoryIsCoherent(
  blueprint: RawBlueprint,
  report: (message: string) => void,
): void {
  if (!blueprint.history) {
    return;
  }

  if (!blueprint.routed) {
    report(
      'history only applies to a routed resource: an unrouted one has no routes to read a history from',
    );
  }

  if (blueprint.model !== undefined && blueprint.model !== blueprint.name) {
    report(
      "history belongs to the resource that owns the model: this one serves another resource's model, so its writes would be snapshotted twice",
    );
  }

  for (const field of blueprint.fields.filter((item) => item.translatable)) {
    report(
      `field "${field.name}" is translatable, which history does not snapshot yet: a snapshot would have to hold every locale`,
    );
  }
}

/**
 * ownRoute only makes sense on an include: an aggregate resolves to a single
 * number, not a collection, so there is nothing for a scoped route to page
 * through.
 */
function assertOwnRouteOnlyOnIncludes(
  blueprint: RawBlueprint,
  report: (message: string) => void,
): void {
  for (const link of blueprint.aggregates) {
    if (link.ownRoute) {
      report(
        `aggregate "${link.relation}" declares ownRoute, which only applies to an include`,
      );
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

/**
 * Fills in what a morphMany link may now leave out. The child declares
 * `morph: commentable` once; the columns are its two halves, and the
 * discriminator value is the parent's own name -- which is what it always was,
 * repeated by hand in every parent until now.
 *
 * Declaring it in both places is refused rather than merged: two sources for
 * one fact is exactly how the fact ends up disagreeing with itself.
 */
function resolveMorph(
  link: BlueprintRelationLink,
  parentName: string,
  referenced: Blueprint,
  problems: string[],
): { foreignKey: string; discriminator?: string; discriminatorValue?: string } {
  if (link.type !== 'morphMany') {
    return { foreignKey: link.foreignKey as string };
  }

  const declaredHere =
    link.foreignKey !== undefined ||
    link.discriminator !== undefined ||
    link.discriminatorValue !== undefined;

  if (referenced.morph) {
    if (declaredHere) {
      problems.push(
        `relation "${link.relation}" repeats what "${referenced.name}" already declares with "morph: ${referenced.morph}" -- remove foreignKey/discriminator/discriminatorValue here, or the morph there`,
      );
    }

    return {
      foreignKey: `${referenced.morph}Id`,
      discriminator: `${referenced.morph}Type`,
      discriminatorValue: pascalCase(parentName),
    };
  }

  if (
    link.foreignKey === undefined ||
    link.discriminator === undefined ||
    link.discriminatorValue === undefined
  ) {
    problems.push(
      `relation "${link.relation}" is a morphMany, so either "${referenced.name}" declares "morph: <name>" or this link spells out foreignKey, discriminator and discriminatorValue`,
    );
  }

  return {
    foreignKey: link.foreignKey ?? '',
    discriminator: link.discriminator,
    discriminatorValue: link.discriminatorValue,
  };
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

    const nestedIncludes =
      link.type === 'hasMany'
        ? referenced.includes
            .filter((nested) => nested.type === 'hasMany')
            .map((nested) => ({ ...nested, includes: undefined }))
        : [];

    includes.push({
      ...link,
      ...resolveMorph(link, blueprint.name, referenced, problems),
      filters: referenced.filters,
      sorts: referenced.sorts,
      selects: [
        'id',
        ...referenced.fields
          .filter((field) => !field.hidden)
          .map((field) => field.name),
      ],
      includes: nestedIncludes.length > 0 ? nestedIncludes : undefined,
      pagination: link.ownRoute ? referenced.pagination : undefined,
    });
  }

  for (const link of blueprint.aggregates) {
    const referenced = loadReferencedBlueprint(link.resource, dir, problems);
    if (!referenced) {
      continue;
    }

    aggregates.push({
      ...link,
      ...resolveMorph(link, blueprint.name, referenced, problems),
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
      childRequiredFields: referenced.fields
        .filter(isScalarField)
        .filter((field) => !field.optional),
      childFields: referenced.fields
        .filter((field) => !field.hidden)
        .map((field) => field.name),
      childSearchFields: referenced.fields
        .filter((field) => field.type === 'string' && !field.hidden)
        .map((field) => field.name),
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
  assertEncryptedFieldsAreCoherent(blueprint, (message) =>
    problems.push(message),
  );
  assertSoftDeletesIsCoherent(blueprint, (message) => problems.push(message));
  assertTranslatableIsCoherent(blueprint, (message) => problems.push(message));
  assertVectorFieldsAreCoherent(blueprint, (message) => problems.push(message));
  assertVersionedIsCoherent(blueprint, (message) => problems.push(message));
  assertHistoryIsCoherent(blueprint, (message) => problems.push(message));
  assertSharingIsCoherent(blueprint, (message) => problems.push(message));
  assertErasureIsCoherent(blueprint, (message) => problems.push(message));
  assertRelationsAreUnique(blueprint, (message) => problems.push(message));
  assertOwnRouteOnlyOnIncludes(blueprint, (message) => problems.push(message));

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

  return {
    ...blueprint,
    fields: concealEncryptedFields(blueprint),
    softDeletes: softDeletesEnabled(blueprint),
    includes,
    aggregates,
    relations,
  };
}
