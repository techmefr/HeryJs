import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import type { Command } from 'commander';
import * as yaml from 'js-yaml';
import pc from 'picocolors';
import prompts from 'prompts';
import { blueprintJsonSchema } from '../lib/blueprint-schema';
import { VECTOR_MAX_DIMENSIONS } from '../lib/blueprint';
import { kebabCase } from '../lib/naming';
import type {
  Blueprint,
  BlueprintField,
  PermissionPreset,
} from '../lib/blueprint';

const SCHEMA_FILENAME = 'schema.json';
const SCHEMA_MODELINE = `# yaml-language-server: $schema=./${SCHEMA_FILENAME}\n`;

const DEFAULT_PAGINATION: NonNullable<Blueprint['pagination']> = {
  limits: [10, 15, 20],
  default: 15,
};

async function promptVector(
  name: string,
  fields: BlueprintField[],
): Promise<BlueprintField | null> {
  const sources = fields.filter((field) => field.type === 'string');

  if (sources.length === 0) {
    console.log(
      pc.yellow(
        `"${name}" needs a string field to embed: add one first, then declare the vector.`,
      ),
    );
    return null;
  }

  const sourceResponse = (await prompts({
    type: 'select',
    name: 'source',
    message: `String field "${name}" embeds`,
    choices: sources.map((field) => ({ title: field.name, value: field.name })),
  })) as { source?: string };

  const dimensionsResponse = (await prompts({
    type: 'number',
    name: 'dimensions',
    message: 'Dimensions (the width of the embedding model, e.g. 1536)',
    initial: 1536,
    min: 1,
    max: VECTOR_MAX_DIMENSIONS,
  })) as { dimensions?: number };

  if (!sourceResponse.source || !dimensionsResponse.dimensions) {
    return null;
  }

  return {
    name,
    type: 'vector',
    optional: false,
    hidden: false,
    translatable: false,
    reveal: false,
    dimensions: dimensionsResponse.dimensions,
    source: sourceResponse.source,
  };
}

async function promptFields(): Promise<BlueprintField[]> {
  const fields: BlueprintField[] = [];

  console.log(
    pc.cyan('Add the fields for this resource (empty name to stop):'),
  );

  for (;;) {
    const nameResponse = (await prompts({
      type: 'text',
      name: 'name',
      message: 'Field name',
    })) as { name?: string };

    if (!nameResponse.name) {
      break;
    }

    const typeResponse = (await prompts({
      type: 'select',
      name: 'type',
      message: `Type for "${nameResponse.name}"`,
      choices: [
        { title: 'string', value: 'string' },
        { title: 'int', value: 'int' },
        { title: 'boolean', value: 'boolean' },
        { title: 'datetime', value: 'datetime' },
        {
          title: 'file (a storage key from POST /storage/upload)',
          value: 'file',
        },
        {
          title: 'encrypted (AES-256-GCM at rest, hidden from responses)',
          value: 'encrypted',
        },
        {
          title:
            'vector (an embedding of another string field, for similarity search)',
          value: 'vector',
        },
      ],
    })) as { type?: BlueprintField['type'] };

    if (typeResponse.type === 'vector') {
      const vector = await promptVector(nameResponse.name, fields);

      if (vector) {
        fields.push(vector);
      }

      continue;
    }

    const optionalResponse = (await prompts({
      type: 'confirm',
      name: 'optional',
      message: 'Optional?',
      initial: false,
    })) as { optional?: boolean };

    const hiddenResponse = (await prompts({
      type: 'confirm',
      name: 'hidden',
      message: 'Hide this field from API responses?',
      initial: false,
    })) as { hidden?: boolean };

    const type = typeResponse.type ?? 'string';
    const translatableResponse =
      type === 'string'
        ? ((await prompts({
            type: 'confirm',
            name: 'translatable',
            message: 'Translatable (one value per locale)?',
            initial: false,
          })) as { translatable?: boolean })
        : {};

    fields.push({
      name: nameResponse.name,
      type,
      optional: optionalResponse.optional ?? false,
      hidden: hiddenResponse.hidden ?? false,
      translatable: translatableResponse.translatable ?? false,
      reveal: false,
    });
  }

  return fields.length > 0
    ? fields
    : [
        {
          name: 'title',
          type: 'string',
          optional: false,
          hidden: false,
          translatable: false,
          reveal: false,
        },
      ];
}

async function promptPermissionFor(
  action: 'view' | 'create' | 'update' | 'delete',
): Promise<PermissionPreset> {
  const response = (await prompts({
    type: 'select',
    name: 'preset',
    message: action,
    choices: [
      { title: 'own', value: 'own' },
      { title: 'team', value: 'team' },
      { title: 'all', value: 'all' },
      { title: 'none', value: 'none' },
    ],
    initial: 0,
  })) as { preset?: PermissionPreset };

  return response.preset ?? 'own';
}

async function promptPermissions(): Promise<{
  view: PermissionPreset;
  create: PermissionPreset;
  update: PermissionPreset;
  delete: PermissionPreset;
}> {
  console.log(pc.cyan('Choose a permission preset for each action:'));
  console.log(
    pc.dim('view drives both the detail route and the collection filter.'),
  );

  return {
    view: await promptPermissionFor('view'),
    create: await promptPermissionFor('create'),
    update: await promptPermissionFor('update'),
    delete: await promptPermissionFor('delete'),
  };
}

function parseCommaList(input: string | undefined): string[] {
  if (!input) {
    return [];
  }

  return input
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

async function promptPagination(): Promise<Blueprint['pagination']> {
  const offerResponse = (await prompts({
    type: 'confirm',
    name: 'paginate',
    message: 'Paginate the search route? (no: it returns every match)',
    initial: false,
  })) as { paginate?: boolean };

  if (!offerResponse.paginate) {
    return undefined;
  }

  const limitsResponse = (await prompts({
    type: 'text',
    name: 'limits',
    message: 'Allowed page sizes (comma-separated)',
    initial: DEFAULT_PAGINATION.limits.join(','),
  })) as { limits?: string };

  const limits = parseCommaList(limitsResponse.limits)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  const defaultResponse = (await prompts({
    type: 'number',
    name: 'value',
    message: 'Default page size',
    initial: limits[0] ?? DEFAULT_PAGINATION.default,
  })) as { value?: number };

  return {
    limits: limits.length > 0 ? limits : DEFAULT_PAGINATION.limits,
    default: defaultResponse.value ?? DEFAULT_PAGINATION.default,
  };
}

async function promptSorts(fieldNames: string[]): Promise<string[]> {
  const response = (await prompts({
    type: 'text',
    name: 'sorts',
    message: 'Sortable fields (comma-separated)',
    initial: ['createdAt', ...fieldNames].join(','),
  })) as { sorts?: string };

  const sorts = parseCommaList(response.sorts);
  return sorts.length > 0 ? sorts : ['createdAt'];
}

async function promptFilters(fieldNames: string[]): Promise<string[]> {
  const response = (await prompts({
    type: 'text',
    name: 'filters',
    message: 'Filterable fields (comma-separated, empty for none)',
    initial: fieldNames.join(','),
  })) as { filters?: string };

  return parseCommaList(response.filters);
}

function allOptionsTemplate(name: string): string {
  return `${SCHEMA_MODELINE}# Every option the generator understands, laid out and commented so you
# can see the full menu at once. Trim what you don't need, then run
# "hery generate ${name}". Policies, controller, and middleware are not
# blueprint options — they are plain NestJS code the generator writes for
# you once, and that you own and edit by hand from then on.
name: ${name}

fields:
  # type: string | int | boolean | datetime
  # optional: true if the field can be null
  # hidden: true to strip the field from every API response (see <name>.view.ts)
  # translatable: true (string only) keeps one value per locale in a Json column
  - name: title
    type: string
    optional: false
    hidden: false
  # - name: count
  #   type: int
  #   optional: false
  #   hidden: false
  # - name: isActive
  #   type: boolean
  #   optional: false
  #   hidden: false
  # - name: scheduledAt
  #   type: datetime
  #   optional: true
  #   hidden: false
  # - name: internalNote
  #   type: string
  #   optional: true
  #   hidden: true

# On unless you say otherwise. Left in: DELETE flags the row (deletedAt), the
# record leaves every listing, and "withTrashed"/"onlyTrashed"/the restore route
# reach it again until prune hard-deletes it on its retention schedule. Set it
# to false and DELETE removes the row for good: no deletedAt column, no restore
# route, no bin, and nothing for prune to sweep.
softDeletes: true

# Off unless you say so. Turn it on and the model gets an integer version column
# that every update, delete and restore increments, the record view exposes it,
# and an update must say which version it read (an entry's "version", or an
# If-Match header on a single-entry request): a save made against a stale
# version is refused for that entry with a 409 (412 via If-Match) instead of
# overwriting what someone else just wrote.
versioned: false

# Off unless you say so. Turn it on and every write stores a snapshot of the
# record (never of a hidden or encrypted field), and the resource gains routes to
# list its history, diff an entry against the record as it is now, and restore
# one through the normal update path. Snapshots age out with prune.
history: false

permissions:
  # preset: own (creator/owner only) | team (same team) | all (any authenticated user) | none (nobody)
  # view drives the detail route and the collection filter from the same preset,
  # so a record can never be hidden from one and exposed by the other.
  # team adds the "teamId" column for you: do not declare it above, hery refuses
  # a blueprint that claims a column the framework decides.
  view: own
  create: own
  update: own
  delete: own

# Optional, and the only place pagination is decided. Declared: the search route
# accepts exactly these page sizes and uses "default" when the caller names none.
# Remove the block: the route returns every match, reports "paginated": false in
# describe, and rejects a caller who sends page or limit.
pagination:
  limits: [10, 15, 20]
  default: 15

sorts:
  - createdAt

filters: []
`;
}

export function registerCreateBlueprintCommand(program: Command): void {
  program
    .command('create:blueprint <name>')
    .description('Create a blueprint file for a new resource')
    .option('-y, --yes', 'Skip prompts and use defaults')
    .option(
      '--all-options',
      'Write a fully commented blueprint listing every available option instead of prompting',
    )
    .action(
      async (
        name: string,
        options: { yes?: boolean; allOptions?: boolean },
      ) => {
        // Matches blueprintSchema's own `name` field: generate can only ever
        // fail on a name shaped otherwise, and a name built from user input
        // that is not this shape is also how the write below could land
        // outside blueprints/ in the first place.
        if (!/^[A-Z][a-zA-Z0-9]*$/.test(name)) {
          console.error(
            pc.red('a resource name must be PascalCase, e.g. BlogCategory'),
          );
          process.exitCode = 1;
          return;
        }

        const blueprintsDir = path.resolve(process.cwd(), 'blueprints');

        if (!existsSync(blueprintsDir)) {
          mkdirSync(blueprintsDir, { recursive: true });
        }

        // Refreshed on every run rather than written once: it is derived
        // entirely from blueprintSchema, so there is nothing project-specific
        // in it to preserve, and a stale copy would silently stop matching
        // the zod schema the moment that schema changes.
        writeFileSync(
          path.join(blueprintsDir, SCHEMA_FILENAME),
          JSON.stringify(blueprintJsonSchema(), null, 2) + '\n',
        );

        const filePath = path.join(blueprintsDir, `${kebabCase(name)}.yaml`);

        if (existsSync(filePath)) {
          console.error(pc.red(`Blueprint already exists: ${filePath}`));
          process.exitCode = 1;
          return;
        }

        if (options.allOptions) {
          writeFileSync(filePath, allOptionsTemplate(name));
          console.log(pc.green(`✔ Created ${filePath}`));
          return;
        }

        const fields = options.yes
          ? [
              {
                name: 'title',
                type: 'string' as const,
                optional: false,
                hidden: false,
              },
            ]
          : await promptFields();

        const permissions = options.yes
          ? {
              view: 'own' as const,
              create: 'own' as const,
              update: 'own' as const,
              delete: 'own' as const,
            }
          : await promptPermissions();

        const fieldNames = fields.map((field) => field.name);

        const pagination = options.yes ? undefined : await promptPagination();

        const sorts = options.yes
          ? ['createdAt']
          : await promptSorts(fieldNames);

        const filters = options.yes ? [] : await promptFilters(fieldNames);

        writeFileSync(
          filePath,
          SCHEMA_MODELINE +
            yaml.dump({
              name,
              fields,
              permissions,
              pagination,
              sorts,
              filters,
            }),
        );
        console.log(pc.green(`✔ Created ${filePath}`));
      },
    );
}
