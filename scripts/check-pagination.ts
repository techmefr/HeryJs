import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..');
const ROOTS = ['src/technical', 'src/devtools', 'src/modules', 'packages'];
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist']);

// A route reached by id returns one record by construction, so it has nothing
// to page through.
const TAKES_A_PARAMETER = /@Get\(\s*['"`][^'"`]*:/;
const COLLECTION_GET = /^\s*@Get\(/;

function controllersIn(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name) ? [] : controllersIn(full);
    }

    return entry.name.endsWith('.controller.ts') ? [full] : [];
  });
}

/**
 * The handler body, from its decorators down to the line the method closes on.
 * Crude on purpose: it only has to tell whether this route pages, and a
 * generated resource's controller is not what this check reads -- a blueprint
 * decides pagination there.
 */
function handlerAfter(lines: string[], index: number): string {
  const closing = lines.findIndex(
    (line, at) => at > index && /^ {2}\}/.test(line),
  );

  return lines.slice(index, closing === -1 ? undefined : closing).join('\n');
}

/**
 * Every collection route this framework writes itself pages, because a route
 * that returns a whole table is a route that stops working at the size the
 * first real tenant reaches -- and a developer installing a module should not
 * have to add pagination to our code before it is usable. A route that
 * genuinely returns everything says so with @UnpaginatedRoute and why.
 */
export function checkPagination(): boolean {
  const files = ROOTS.flatMap((root) =>
    controllersIn(path.join(REPO_ROOT, root)),
  );
  const problems: string[] = [];
  let checked = 0;
  let exempt = 0;

  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');

    lines.forEach((line, index) => {
      if (!COLLECTION_GET.test(line) || TAKES_A_PARAMETER.test(line)) {
        return;
      }

      checked += 1;
      const handler = handlerAfter(lines, index);
      const declared = lines
        .slice(Math.max(0, index - 6), index)
        .some((previous) => previous.includes('@UnpaginatedRoute('));

      if (declared) {
        exempt += 1;
        return;
      }

      if (!handler.includes('okPage(')) {
        problems.push(
          `${path.relative(REPO_ROOT, file)}:${index + 1} returns a collection without paging it — read the page with parsePageQuery and answer with okPage, or declare @UnpaginatedRoute('<why>')`,
        );
      }
    });
  }

  if (checked === 0) {
    console.error(
      'Found no collection route to check. This check reports success on an\nempty scan, so an empty scan has to be the failure instead.',
    );
    return false;
  }

  if (problems.length > 0) {
    console.error('Collection routes that would return a whole table:\n');
    problems.forEach((problem) => console.error(`  ${problem}`));
    return false;
  }

  console.log(
    `✔ every kernel collection route pages (${checked} routes, ${exempt} declared unpaginated with a reason)`,
  );

  return true;
}

if (require.main === module) {
  process.exit(checkPagination() ? 0 : 1);
}
