import { existsSync, readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { walkFiles } from '../walk';
import type { LintRule, Violation } from '../types';

// Only the application's own runtime is in scope. cli/ and scripts/ are the
// generator's own tooling, not the shape a generated project's code follows,
// and a fair amount of it legitimately bootstraps from process.env before
// env.ts's schema can even be loaded.
//
// A module's src/runtime is the same rule: it is what `hery install` copies
// verbatim into src/modules/, so a raw read there survives the copy and
// reaches production. The rest of a module -- its src/module.ts -- is
// build-time-only CLI code, the same category as cli/ and scripts/, and stays
// out of scope for the same reason.
function packageRuntimeRoots(repoRoot: string): string[] {
  const packagesDir = path.join(repoRoot, 'packages');

  if (!existsSync(packagesDir)) {
    return [];
  }

  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packagesDir, entry.name, 'src', 'runtime'))
    .filter((dir) => existsSync(dir));
}

// The only two files allowed to touch process.env directly, and both of them
// exist to validate what they read: env.ts parses the application's own schema,
// module-env.ts parses the schema an installed module declares for itself. Every
// other read is supposed to go through one of their exports instead.
const ALLOWED_FILES = [
  'src/technical/config/env.ts',
  'src/technical/config/module-env.ts',
];

const PATTERN = /process\.env\b/;

// NODE_ENV is the one name this rule does not ask to be validated. It is Node's
// own switch rather than configuration of ours: it is read before any schema can
// be loaded, its value is not a value the framework chooses, and pinning it to a
// list would refuse the deployments that legitimately run under `staging`. What
// the rule is about is configuration -- a URL, a credential, a limit -- where a
// missing or misspelled variable has to fail at boot instead of defaulting in
// silence. Branching production behaviour on NODE_ENV has its own check,
// `lint:dev-guard`, which is where that concern belongs.
const NODE_ENV_READ = /process\.env\.NODE_ENV\b/g;

function checkFile(filePath: string, repoRoot: string): Violation[] {
  const relative = path.relative(repoRoot, filePath).split(path.sep).join('/');

  if (ALLOWED_FILES.includes(relative)) {
    return [];
  }

  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const violations: Violation[] = [];

  lines.forEach((text, index) => {
    if (PATTERN.test(text.replace(NODE_ENV_READ, ''))) {
      violations.push({
        rule: 'no-raw-process-env',
        severity: 'major',
        file: relative,
        line: index + 1,
        message: `${relative}:${index + 1} — reads process.env directly instead of the validated env export`,
      });
    }
  });

  return violations;
}

export const noRawProcessEnvRule: LintRule = {
  name: 'no-raw-process-env',
  run(repoRoot) {
    const roots = [
      path.join(repoRoot, 'src'),
      ...packageRuntimeRoots(repoRoot),
    ].filter((dir) => existsSync(dir));

    return roots
      .flatMap((dir) =>
        walkFiles(
          dir,
          (name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'),
        ),
      )
      .flatMap((file) => checkFile(file, repoRoot));
  },
};
