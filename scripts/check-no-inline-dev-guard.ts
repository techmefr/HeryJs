import { readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';

const BANNED_PATTERN = /NODE_ENV\s*===\s*['"]production['"]/;

function findControllerFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return findControllerFiles(fullPath);
    }

    return entry.name.endsWith('.controller.ts') ? [fullPath] : [];
  });
}

export function checkNoInlineDevGuard(): boolean {
  const srcDir = path.resolve(__dirname, '..', 'src');
  const controllerFiles = findControllerFiles(srcDir);

  const violations = controllerFiles.filter((filePath) =>
    BANNED_PATTERN.test(readFileSync(filePath, 'utf8')),
  );

  if (violations.length > 0) {
    console.error(
      'Controllers must not hand-roll a NODE_ENV production check — use DevOnlyGuard instead, so every dev-only route enforces it the same way:\n',
    );
    violations.forEach((filePath) => console.error(`  ${filePath}`));
    return false;
  }

  console.log(
    `✔ no controller hand-rolls a production check (${controllerFiles.length} controllers checked)`,
  );

  return true;
}
