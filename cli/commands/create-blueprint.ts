import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import type { Command } from 'commander';
import * as yaml from 'js-yaml';
import pc from 'picocolors';
import prompts from 'prompts';
import { kebabCase } from '../lib/naming';
import type {
  Blueprint,
  BlueprintField,
  PermissionPreset,
} from '../lib/blueprint';

const DEFAULT_PAGINATION: Blueprint['pagination'] = {
  limits: [10, 15, 20],
  default: 15,
};

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
      ],
    })) as { type?: BlueprintField['type'] };

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

    fields.push({
      name: nameResponse.name,
      type: typeResponse.type ?? 'string',
      optional: optionalResponse.optional ?? false,
      hidden: hiddenResponse.hidden ?? false,
    });
  }

  return fields.length > 0
    ? fields
    : [{ name: 'title', type: 'string', optional: false, hidden: false }];
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
  return `# Every option the generator understands, laid out and commented so you
# can see the full menu at once. Trim what you don't need, then run
# "hery generate ${name}". Policies, controller, and middleware are not
# blueprint options — they are plain NestJS code the generator writes for
# you once, and that you own and edit by hand from then on.
name: ${name}

fields:
  # type: string | int | boolean | datetime
  # optional: true if the field can be null
  # hidden: true to strip the field from every API response (see <name>.view.ts)
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
        const blueprintsDir = path.resolve(process.cwd(), 'blueprints');

        if (!existsSync(blueprintsDir)) {
          mkdirSync(blueprintsDir, { recursive: true });
        }

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

        const pagination = options.yes
          ? DEFAULT_PAGINATION
          : await promptPagination();

        const sorts = options.yes
          ? ['createdAt']
          : await promptSorts(fieldNames);

        const filters = options.yes ? [] : await promptFilters(fieldNames);

        writeFileSync(
          filePath,
          yaml.dump({ name, fields, permissions, pagination, sorts, filters }),
        );
        console.log(pc.green(`✔ Created ${filePath}`));
      },
    );
}
