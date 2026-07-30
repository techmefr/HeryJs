import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';

const BANNED_PATTERN = /(?<![.\w])teamIds\s*:/;

const ALLOWED_FILES = new Map([
  [
    'src/technical/capabilities/subject.ts',
    'the sanctioned builder, the one place a subject is assembled',
  ],
  [
    'src/technical/auth/session-auth.provider.ts',
    'assembles the session from the database, which is what the subject derives from',
  ],
]);

const root = path.resolve(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return entry.name === 'node_modules' ? [] : sourceFiles(fullPath);
    }

    const skipped =
      !entry.name.endsWith('.ts') ||
      entry.name.endsWith('.spec.ts') ||
      entry.name.endsWith('.types.ts');

    return skipped ? [] : [fullPath];
  });
}

for (const [relativePath, reason] of ALLOWED_FILES) {
  if (!existsSync(path.join(root, relativePath))) {
    throw new Error(
      `${relativePath} is allowed to build a subject (${reason}) but no longer exists`,
    );
  }
}

const scanned = ['src', 'cli'].flatMap((directory) =>
  sourceFiles(path.join(root, directory)),
);

const violations = scanned.filter((filePath) => {
  const relativePath = path.relative(root, filePath).split(path.sep).join('/');

  return (
    !ALLOWED_FILES.has(relativePath) &&
    BANNED_PATTERN.test(readFileSync(filePath, 'utf8'))
  );
});

if (violations.length > 0) {
  console.error(
    'A capability subject must come from subjectOf(user), never from a hand-written literal — every call site writing its own is a place the next field silently stays empty:\n',
  );
  violations.forEach((filePath) =>
    console.error(`  ${path.relative(root, filePath)}`),
  );
  process.exit(1);
}

console.log(
  `✔ every capability subject comes from subjectOf (${scanned.length} files checked)`,
);
