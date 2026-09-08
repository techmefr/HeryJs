import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { kebabToPascalCase } from './naming';
import { nameProblem } from './module-definition';
import { KERNEL_VERSION } from './kernel-version';

/**
 * Pinned from whatever this repository resolves rather than written into the
 * template, so a scaffolded module typechecks against the same NestJS the
 * kernel does. A literal here would be stale the first time the root moves.
 */
const SCAFFOLD_DEPENDENCIES = ['@nestjs/common', 'typescript'];

export function scaffoldProblem(
  name: string,
  packagesDir: string,
  takenNames: string[] = [],
): string | undefined {
  const badName = nameProblem(name);

  if (badName !== undefined) {
    return badName;
  }

  if (existsSync(path.join(packagesDir, name))) {
    return `packages/${name} already exists`;
  }

  if (takenNames.includes(name)) {
    return `a module named "${name}" is already installable here`;
  }

  return undefined;
}

function dependencyRanges(repoRoot: string): Record<string, string> {
  const manifest = JSON.parse(
    readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
  ) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const declared = { ...manifest.dependencies, ...manifest.devDependencies };

  return SCAFFOLD_DEPENDENCIES.reduce<Record<string, string>>(
    (ranges, dependency) => {
      const range = declared[dependency];

      return range === undefined ? ranges : { ...ranges, [dependency]: range };
    },
    {},
  );
}

/**
 * The `heryjs.module` marker is what the community channel discovers, so it is
 * written from the start: the package a third party installs from npm is then
 * the same package as the one authored here, with nothing to remember at
 * publish time.
 */
function manifest(name: string, repoRoot: string): string {
  return `${JSON.stringify(
    {
      name,
      private: true,
      version: '0.0.1',
      heryjs: { module: true },
      devDependencies: dependencyRanges(repoRoot),
    },
    null,
    2,
  )}\n`;
}

/**
 * `test` is in the include list before the directory exists, because the day
 * an author adds one is the day their typed lint rules start reporting every
 * file in it as outside the project -- a message that says nothing about the
 * tsconfig that caused it.
 */
const TSCONFIG = `{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "paths": {
      "#kernel/*": ["../../src/technical/*"]
    },
    "noEmit": true
  },
  "include": ["src", "test"],
  "exclude": ["node_modules"]
}
`;

function definition(name: string): string {
  const pascal = kebabToPascalCase(name);

  return `import { defineModule } from '../../../cli/lib/module-definition';

export default defineModule({
  name: '${name}',
  description: 'One sentence, which is the line hery module:list prints.',
  meta: { compatibility: '>=${KERNEL_VERSION}' },
  install(context) {
    context.copyRuntime();

    context.nextSteps(['Import ${pascal}Module into src/app.module.ts']);
  },
});
`;
}

function service(name: string): string {
  const pascal = kebabToPascalCase(name);

  return `import { Injectable } from '@nestjs/common';

/**
 * The placeholder this module was scaffolded with. Replace it: the shape is
 * what matters here -- a real file under src/runtime, copied into the project
 * once and owned by it from then on, importing the kernel as #kernel/... so
 * the copy that lands can be rewritten to the app's own #technical/.
 */
@Injectable()
export class ${pascal}Service {
  name(): string {
    return '${name}';
  }
}
`;
}

function nestModule(name: string): string {
  const pascal = kebabToPascalCase(name);

  return `import { Module } from '@nestjs/common';
import { ${pascal}Service } from './${name}.service';

@Module({
  providers: [${pascal}Service],
  exports: [${pascal}Service],
})
export class ${pascal}Module {}
`;
}

/**
 * Scaffolded rather than left to the author, because a module ships its tests:
 * `copyRuntime` copies this file into the project alongside the code, where
 * the installing project's own suite runs it. A module with no spec is a
 * module whose installer has nothing to run.
 */
function spec(name: string): string {
  const pascal = kebabToPascalCase(name);

  return `import { ${pascal}Service } from './${name}.service';

describe('${pascal}Service', () => {
  it('knows the module it belongs to', () => {
    expect(new ${pascal}Service().name()).toBe('${name}');
  });
});
`;
}

export function scaffoldModule(
  name: string,
  packagesDir: string,
  repoRoot: string,
): string[] {
  const packageDir = path.join(packagesDir, name);
  const runtimeDir = path.join(packageDir, 'src', 'runtime');

  mkdirSync(runtimeDir, { recursive: true });

  const files: Array<[string, string]> = [
    [path.join(packageDir, 'package.json'), manifest(name, repoRoot)],
    [path.join(packageDir, 'tsconfig.json'), TSCONFIG],
    [path.join(packageDir, 'src', 'module.ts'), definition(name)],
    [path.join(runtimeDir, `${name}.service.ts`), service(name)],
    [path.join(runtimeDir, `${name}.module.ts`), nestModule(name)],
    [path.join(runtimeDir, `${name}.service.spec.ts`), spec(name)],
  ];

  files.forEach(([file, contents]) => writeFileSync(file, contents));

  return files.map(([file]) => path.relative(repoRoot, file));
}
