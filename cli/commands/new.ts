import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { Command } from 'commander';
import pc from 'picocolors';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Everything a fresh project needs to run `hery generate`/`hery install` on
 * its own: the CLI itself, every module's authoring package, the kernel
 * (technical/), the always-there DX tools (devtools/), the modules already
 * wired into AppModule by default (modules/), and the config each of those
 * depends on. Deliberately excluded: examples/ and docs/ (this framework's
 * own demo and doc site, not part of what ships), admin/ (installed later via
 * `hery install admin-astro`, same as any other opt-in module), and anything
 * that is this repository's own build/dev state (node_modules, dist, the
 * lockfile, .git, .env).
 */
const COPY_ENTRIES = [
  'cli',
  'packages',
  'scripts',
  'src/technical',
  'src/devtools',
  'src/modules',
  'src/functional',
  'src/app.controller.ts',
  'src/app.controller.spec.ts',
  'src/app.module.ts',
  'src/app.service.ts',
  'src/main.ts',
  'test',
  '.github',
  'prisma/schema.prisma',
  'prisma.config.ts',
  '.dependency-cruiser.cjs',
  'tsconfig.json',
  'tsconfig.build.json',
  'tsconfig.depcruise.json',
  'nest-cli.json',
  'eslint.config.mjs',
  '.oxlintrc.json',
  '.prettierrc',
  '.env.example',
  '.nvmrc',
  '.gitignore',
  'docker-compose.yml',
  'docker-compose.storage.yml',
  'docker-compose.stream.yml',
  'Caddyfile',
  'package.json',
  'pnpm-workspace.yaml',
];

/**
 * The only convention check that does not survive the copy: it exists to
 * catch this repository's own example drifting from its generator, and a
 * fresh project ships no examples/ directory at all.
 */
function dropExampleFreshnessCheck(destRoot: string): void {
  rmSync(path.join(destRoot, 'scripts/check-example-freshness.ts'));

  const file = path.join(destRoot, 'scripts/check-conventions.ts');
  const source = readFileSync(file, 'utf8');

  writeFileSync(
    file,
    source
      .replace(
        "import { checkExampleFreshness } from './check-example-freshness';\n",
        '',
      )
      .replace(
        "  { name: 'example-freshness', run: checkExampleFreshness },\n",
        '',
      ),
  );
}

/**
 * Two kernel specs need a real resource to exercise (describe/inspector both
 * introspect whatever routes exist) and reach for examples/workout for one,
 * since this repository always has it. A fresh project has no resource yet,
 * and does not need to re-prove that introspection works with one — that is
 * this framework's own test suite's job, not a downstream project's.
 */
function dropSpecsThatNeedTheExample(destRoot: string): void {
  rmSync(path.join(destRoot, 'src/technical/describe/describe.spec.ts'));
  rmSync(path.join(destRoot, 'src/devtools/inspector/inspector.spec.ts'));
}

function rewritePackageJson(destRoot: string, projectName: string): void {
  const file = path.join(destRoot, 'package.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as {
    name: string;
    description: string;
    scripts: Record<string, string>;
    jest: { roots: string[] };
  };

  manifest.name = projectName;
  manifest.description = 'A HeryJs project.';
  delete manifest.scripts['lint:example'];
  manifest.jest.roots = ['<rootDir>/src'];

  // No admin/ workspace and no examples/ directory until the dev installs
  // admin-astro or generates a resource — both otherwise-absent things this
  // repository's own lint script assumes. The ignore-pattern stays: the
  // admin-astro package's own eslint.config.mjs still ships in packages/ and
  // still shadows the root config for its neighbors the same way it does here.
  manifest.scripts.lint =
    'eslint "{src,apps,libs,test,cli,scripts,prisma,packages}/**/*.ts" "prisma.config.ts" --ignore-pattern "packages/admin-astro/src/runtime/**" --fix';

  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * 'admin' and 'docs' are this repository's own workspace members. Neither
 * ships: the admin is opt-in (`hery install admin-astro` adds it back to this
 * same file), and the doc site is specific to the framework itself.
 */
function rewriteWorkspaceFile(destRoot: string): void {
  const file = path.join(destRoot, 'pnpm-workspace.yaml');
  const source = readFileSync(file, 'utf8');

  writeFileSync(
    file,
    source.replace("  - 'admin'\n", '').replace("  - 'docs'\n", ''),
  );
}

function writeReadme(destRoot: string, projectName: string): void {
  writeFileSync(
    path.join(destRoot, 'README.md'),
    `# ${projectName}

A project built with [HeryJs](https://github.com/techmefr/HeryJs).

## Getting started

\`\`\`bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm exec prisma migrate dev
pnpm start:dev
\`\`\`

## Adding a resource

\`\`\`bash
pnpm hery create:blueprint <Name>
pnpm hery generate blueprints/<name>.yaml
\`\`\`

The blueprint is only read once, at generation time. From then on the generated files are yours to edit like any other NestJS code — nothing re-syncs.

## Adding a module

\`\`\`bash
pnpm hery module:list
pnpm hery install <module>
\`\`\`
`,
  );
}

function copyInto(destRoot: string): void {
  for (const entry of COPY_ENTRIES) {
    const source = path.join(REPO_ROOT, entry);

    if (!existsSync(source)) {
      continue;
    }

    const destination = path.join(destRoot, entry);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(source, destination, { recursive: true });
  }
}

export function registerNewCommand(program: Command): void {
  program
    .command('new <name>')
    .description('Scaffold a new HeryJs project in its own directory')
    .action((name: string) => {
      if (!/^[a-z][a-z0-9-]*$/.test(name)) {
        console.error(
          pc.red(
            `"${name}" is not a valid project name — use lowercase letters, digits, and hyphens only.`,
          ),
        );
        process.exitCode = 1;
        return;
      }

      const destRoot = path.resolve(process.cwd(), name);

      if (existsSync(destRoot)) {
        console.error(pc.red(`${destRoot} already exists.`));
        process.exitCode = 1;
        return;
      }

      mkdirSync(destRoot, { recursive: true });
      copyInto(destRoot);
      dropExampleFreshnessCheck(destRoot);
      dropSpecsThatNeedTheExample(destRoot);
      rewritePackageJson(destRoot, name);
      rewriteWorkspaceFile(destRoot);
      writeReadme(destRoot, name);

      spawnSync('git', ['init'], { cwd: destRoot, stdio: 'ignore' });
      spawnSync('git', ['add', '-A'], { cwd: destRoot, stdio: 'ignore' });
      spawnSync(
        'git',
        ['commit', '-m', 'Scaffold a new HeryJs project', '--quiet'],
        { cwd: destRoot, stdio: 'ignore' },
      );

      console.log(pc.green(`✔ Created ${destRoot}`));
      console.log('');
      console.log(pc.cyan('Next steps:'));
      console.log(`  cd ${name}`);
      console.log(`  cp .env.example .env`);
      console.log(`  docker compose up -d`);
      console.log(`  pnpm install`);
      console.log(`  pnpm exec prisma migrate dev`);
      console.log(`  pnpm start:dev`);
    });
}
