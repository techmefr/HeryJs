import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';

const root = path.resolve(__dirname, '..');
const modulesDir = path.join(root, 'cli', 'modules');

const CONTENT_CONST = /^const (\w+_CONTENT) = `([\s\S]*?)\n`;$/gm;
const DESTINATION_CONST = /^const (\w+_FILE) =\s*'([^']+)';$/gm;
const WRITTEN_ENTRY = /\[(\w+_FILE)\]:\s*(\w+_CONTENT)/g;
const RELATIVE_IMPORT = /from '(\.[^']+)'/g;

function captures(source: string, pattern: RegExp): Array<[string, string]> {
  return [...source.matchAll(pattern)].map((match) => [
    match[1] ?? '',
    match[2] ?? '',
  ]);
}

function resolves(target: string): boolean {
  return (
    existsSync(`${target}.ts`) ||
    existsSync(path.join(target, 'index.ts')) ||
    existsSync(target)
  );
}

/**
 * A module template is a string, so nothing type-checks the imports it writes.
 * Splitting src/ into layers moved four modules out of technical/ and left every
 * `../` import in their templates pointing at a directory that no longer sits
 * there -- fifteen imports that resolved fine in this repo and broke in every
 * project generated from it. The destination path is right there in the
 * template, so the resolution can be checked here instead.
 */
export function checkModuleTemplateImports(): boolean {
  const problems: string[] = [];
  let checkedFiles = 0;
  let checkedImports = 0;

  for (const entry of readdirSync(modulesDir)) {
    if (!entry.endsWith('.ts') || entry === 'index.ts') {
      continue;
    }

    const source = readFileSync(path.join(modulesDir, entry), 'utf8');
    const contents = new Map(captures(source, CONTENT_CONST));
    const destinations = new Map(captures(source, DESTINATION_CONST));
    const written: Array<{ destination: string; body: string }> = [];

    for (const [fileConst, contentConst] of captures(source, WRITTEN_ENTRY)) {
      const destination = destinations.get(fileConst);
      const body = contents.get(contentConst);

      if (destination === undefined || body === undefined) {
        problems.push(
          `${entry} writes ${fileConst} from ${contentConst}, and one of the two is not a plain top-level constant this check can read`,
        );
        continue;
      }

      if (destination.startsWith('src/') && destination.endsWith('.ts')) {
        written.push({ destination, body });
      }
    }

    const installs = new Set(
      written.map(({ destination }) =>
        path.join(root, destination).replace(/\.ts$/, ''),
      ),
    );

    for (const { destination, body } of written) {
      checkedFiles += 1;
      const destinationDir = path.dirname(path.join(root, destination));

      for (const [specifier] of captures(body, RELATIVE_IMPORT)) {
        checkedImports += 1;
        const target = path.resolve(destinationDir, specifier);

        if (!installs.has(target) && !resolves(target)) {
          problems.push(
            `${entry} writes ${destination}, whose import of '${specifier}' resolves neither to an existing file nor to anything ${entry} installs`,
          );
        }
      }
    }
  }

  if (checkedFiles === 0 || checkedImports === 0) {
    console.error(
      `✖ this check found ${checkedFiles} generated file(s) and ${checkedImports} import(s) to resolve, so it proved nothing. The module templates no longer look the way it reads them.`,
    );
    return false;
  }

  if (problems.length > 0) {
    console.error(
      'A module template writes an import that resolves in this repo but not where the file lands:\n',
    );
    problems.forEach((problem) => console.error(`  ${problem}`));
    return false;
  }

  console.log(
    `✔ every module template import resolves from where the file lands (${checkedImports} imports across ${checkedFiles} generated files)`,
  );

  return true;
}
