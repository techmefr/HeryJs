import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import type { Command } from 'commander';
import * as yaml from 'js-yaml';
import pc from 'picocolors';
import prompts from 'prompts';
import { kebabCase } from '../lib/naming';
import type { BlueprintField, PermissionPreset } from '../lib/blueprint';

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
  action: 'create' | 'update' | 'delete',
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
  create: PermissionPreset;
  update: PermissionPreset;
  delete: PermissionPreset;
}> {
  console.log(pc.cyan('Choose a permission preset for each action:'));

  return {
    create: await promptPermissionFor('create'),
    update: await promptPermissionFor('update'),
    delete: await promptPermissionFor('delete'),
  };
}

export function registerCreateBlueprintCommand(program: Command): void {
  program
    .command('create:blueprint <name>')
    .description('Create a blueprint file for a new resource')
    .option('-y, --yes', 'Skip prompts and use defaults')
    .action(async (name: string, options: { yes?: boolean }) => {
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
            create: 'own' as const,
            update: 'own' as const,
            delete: 'own' as const,
          }
        : await promptPermissions();

      writeFileSync(filePath, yaml.dump({ name, fields, permissions }));
      console.log(pc.green(`✔ Created ${filePath}`));
    });
}
