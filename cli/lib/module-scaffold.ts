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

/**
 * The runtime a module ships lands inside the developer's application and is
 * instantiated by their Nest container, so NestJS is theirs to provide. A
 * bundled copy would be a second set of decorators their container cannot
 * resolve.
 */
const NEST_PEER_RANGE = '^12.0.0';

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
 * `workspace:*` inside this repository, where the package is the workspace
 * root, and the kernel range anywhere else, where it is a release from npm.
 * The build resolves the contract through the package rather than through a
 * path, which is what makes a module's own build prove the published
 * declaration is usable -- the same way a third party's does.
 */
function contractRange(repoRoot: string): string {
  const manifestPath = path.join(repoRoot, 'package.json');
  const name = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as { name?: string }).name
    : undefined;

  return name === 'heryjs' ? 'workspace:*' : `^${KERNEL_VERSION}`;
}

/**
 * The whole published contract, written from the start rather than left for
 * publish day: the `heryjs.module` marker the community channel discovers,
 * a `main` at compiled JavaScript because the CLI requires the entry under
 * ts-node and ts-node ignores `node_modules`, and a `files` shipping `dist`
 * for the entry and `src/runtime` as the sources `copyRuntime` copies. A
 * scaffold that left those out produced a package that only ever worked in
 * the directory it was written in.
 */
function manifest(name: string, repoRoot: string): string {
  return `${JSON.stringify(
    {
      name,
      version: '0.0.1',
      description: 'One sentence, which is the line hery module:list prints.',
      license: 'MIT',
      heryjs: { module: true },
      main: 'dist/module.js',
      types: 'dist/module.d.ts',
      files: ['dist', 'src/runtime'],
      scripts: {
        build: 'tsc -p tsconfig.build.json',
        prepack: 'pnpm run build',
      },
      peerDependencies: { '@nestjs/common': NEST_PEER_RANGE },
      devDependencies: {
        ...dependencyRanges(repoRoot),
        heryjs: contractRange(repoRoot),
      },
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
      "#kernel/*": ["../../src/technical/*"],
      "heryjs": ["../../cli/module-contract.ts"]
    },
    "noEmit": true
  },
  "include": ["src", "test"],
  "exclude": ["node_modules"]
}
`;

/**
 * Emitting is a second configuration rather than a flag on the first, because
 * the two resolve the contract differently on purpose. This one goes through
 * the package, the way a third party's build does, so it proves the published
 * declaration is usable; the authoring config above goes through a path, so a
 * typecheck and a lint need no build first and work the same inside a
 * generated project, which has `cli/` but no `heryjs` package.
 */
const TSCONFIG_BUILD = `{
  "extends": "../../tsconfig.module.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/module.ts"],
  "exclude": ["node_modules", "dist"]
}
`;

function definition(name: string): string {
  const pascal = kebabToPascalCase(name);

  return `import type { ModuleDefinition } from 'heryjs';

export default {
  name: '${name}',
  description: 'One sentence, which is the line hery module:list prints.',
  meta: { compatibility: '>=${KERNEL_VERSION}' },
  install(context) {
    context.copyRuntime();

    context.nextSteps(['Import ${pascal}Module into src/app.module.ts']);
  },
} satisfies ModuleDefinition;
`;
}

/**
 * npm renders this as the package's whole page, so a module published without
 * one arrives blank. Scaffolded with the two things a reader needs first --
 * the command that installs it and where its runtime lands.
 */
function readme(name: string): string {
  return `# ${name}

One sentence about what this module adds. The same sentence belongs in
\`package.json\` and in the definition's \`description\`, which is the line
\`hery module:list\` prints.

## Install

\`\`\`bash
pnpm add ${name}
pnpm hery install ${name}
\`\`\`

The install copies \`src/runtime/\` into \`src/modules/${name}\` and prints what is
left to wire up. From then on the code belongs to the project: it is never
resynchronised, and a new version of this package does not touch what it wrote.
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
    [path.join(packageDir, 'tsconfig.build.json'), TSCONFIG_BUILD],
    [path.join(packageDir, 'README.md'), readme(name)],
    [path.join(packageDir, 'src', 'module.ts'), definition(name)],
    [path.join(runtimeDir, `${name}.service.ts`), service(name)],
    [path.join(runtimeDir, `${name}.module.ts`), nestModule(name)],
    [path.join(runtimeDir, `${name}.service.spec.ts`), spec(name)],
  ];

  files.forEach(([file, contents]) => writeFileSync(file, contents));

  return files.map(([file]) => path.relative(repoRoot, file));
}
