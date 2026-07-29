import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { parseArgv } from '../lib/argv';
import { kebabCase } from '../lib/naming';

export function runCreateBlueprint(argv: string[]): void {
  const { positional } = parseArgv(argv);
  const name = positional[0];

  if (!name) {
    console.error('Usage: hery create:blueprint <Name>');
    process.exitCode = 1;
    return;
  }

  const blueprintsDir = path.resolve(process.cwd(), 'blueprints');

  if (!existsSync(blueprintsDir)) {
    mkdirSync(blueprintsDir, { recursive: true });
  }

  const filePath = path.join(blueprintsDir, `${kebabCase(name)}.yaml`);

  if (existsSync(filePath)) {
    console.error(`Blueprint already exists: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  const defaults = {
    name,
    fields: [{ name: 'title', type: 'string', optional: false }],
    permissions: { create: 'own', update: 'own', delete: 'own' },
  };

  writeFileSync(filePath, yaml.dump(defaults));
  console.log(`Created ${filePath}`);
}
