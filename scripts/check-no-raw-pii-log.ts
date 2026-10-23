import { readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..');
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage']);
const LOG_CALL =
  /\b(?:logger|this\.logger|Logger|console)\.(?:log|info|warn|error|debug|verbose|fatal|trace)\s*\(/g;
const RAW_OBJECT =
  /(?<![\w.$'"`])(?:user|body|dto|\w+Dto|(?:req|request)\.body)\b(?!\s*(?:\??\.|\[|\(|:))/;
const REDACTED_CALL = /\bredactForLog\s*\(/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name) ? [] : sourceFiles(fullPath);
    }

    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
      ? [fullPath]
      : [];
  });
}

function scannedRoots(): string[] {
  const packages = path.join(REPO_ROOT, 'packages');

  return [
    path.join(REPO_ROOT, 'src'),
    ...readdirSync(packages, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(packages, entry.name, 'src', 'runtime')),
  ].filter((dir) => {
    try {
      readdirSync(dir);
      return true;
    } catch {
      return false;
    }
  });
}

function argumentsAt(source: string, open: number): string {
  let depth = 1;
  let index = open;

  while (index < source.length && depth > 0) {
    const char = source[index];

    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    index += 1;
  }

  return source.slice(open, index - 1);
}

/**
 * Keeps the code of a call's arguments and drops the text of its string
 * literals, template interpolations included as code: `body="${message.body}"`
 * is the field `message.body`, not a request body.
 */
function stripStrings(text: string): string {
  const stack: Array<'code' | '`'> = ['code'];
  const braces: number[] = [];
  let quote: "'" | '"' | null = null;
  let code = '';

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;

    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = null;
      continue;
    }

    if (stack[stack.length - 1] === '`') {
      if (char === '\\') {
        index += 1;
      } else if (char === '`') {
        stack.pop();
        code += ' ';
      } else if (char === '$' && text[index + 1] === '{') {
        stack.push('code');
        braces.push(0);
        index += 1;
        code += ' ';
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      code += ' ';
    } else if (char === '`') {
      stack.push('`');
    } else if (char === '{' && braces.length > 0) {
      braces.push((braces.pop() ?? 0) + 1);
      code += char;
    } else if (char === '}' && braces.length > 0) {
      const depth = braces.pop() ?? 0;

      if (depth === 0) {
        stack.pop();
        code += ' ';
      } else {
        braces.push(depth - 1);
        code += char;
      }
    } else {
      code += char;
    }
  }

  return code;
}

export function rawLogArguments(source: string): string[] {
  return [...source.matchAll(LOG_CALL)]
    .map((match) => argumentsAt(source, match.index + match[0].length))
    .filter((args) => {
      const code = stripStrings(args);

      return RAW_OBJECT.test(code) && !REDACTED_CALL.test(code);
    });
}

/**
 * A user, a request body or a DTO handed whole to a logger lands every field
 * it carries in the log sinks. The pipeline redacts what it recognises, but a
 * call site that means to log one of them passes it through redactForLog, so
 * the intent is visible where the line is written.
 */
export function checkNoRawPiiLog(): boolean {
  const files = scannedRoots().flatMap(sourceFiles);
  const violations = files.flatMap((filePath) =>
    rawLogArguments(readFileSync(filePath, 'utf8')).map(
      (args) =>
        `${path.relative(REPO_ROOT, filePath)}: ${args.replace(/\s+/g, ' ').slice(0, 120)}`,
    ),
  );

  if (violations.length > 0) {
    console.error(
      'Log a user, a request body or a DTO through redactForLog(...), never as is:\n',
    );
    violations.forEach((violation) => console.error(`  ${violation}`));
    return false;
  }

  console.log(
    `✔ no log call hands a user, a request body or a DTO over unredacted (${files.length} files checked)`,
  );

  return true;
}
