import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import { ADMIN_ICONS } from '../src/technical/admin/admin-icons';

const ROUTE_DECORATORS = new Set(['Get', 'Post', 'Patch', 'Put', 'Delete']);
const SCOPES = new Set(['row', 'bulk', 'global']);
const IDENTIFIER = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const ROOTS = ['src', 'examples', 'packages'];
const SKIPPED = new Set(['node_modules', 'dist']);

interface Declaration {
  kind: 'AdminSection' | 'AdminAction';
  where: string;
  verb: string;
  routePath: string;
  hasCapability: boolean;
  fields: Map<string, string>;
}

function controllerFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return SKIPPED.has(entry.name) ? [] : controllerFiles(full);
    }

    return entry.name.endsWith('.controller.ts') ? [full] : [];
  });
}

function callOf(decorator: ts.Decorator): ts.CallExpression | undefined {
  return ts.isCallExpression(decorator.expression)
    ? decorator.expression
    : undefined;
}

function calleeName(decorator: ts.Decorator): string | undefined {
  const call = callOf(decorator);
  const callee = call ? call.expression : decorator.expression;

  return ts.isIdentifier(callee) ? callee.text : undefined;
}

// Only literal values are read: a title or an id computed at runtime cannot be
// checked, and the admin could not show it before the app booted anyway.
function literalFields(node: ts.Expression | undefined): Map<string, string> {
  const fields = new Map<string, string>();

  if (!node || !ts.isObjectLiteralExpression(node)) {
    return fields;
  }

  for (const property of node.properties) {
    if (
      ts.isPropertyAssignment(property) &&
      ts.isIdentifier(property.name) &&
      ts.isStringLiteralLike(property.initializer)
    ) {
      fields.set(property.name.text, property.initializer.text);
    }
  }

  return fields;
}

function declarationsOf(filePath: string): {
  declarations: Declaration[];
  usesDevOnlyGuard: boolean;
} {
  const text = readFileSync(filePath, 'utf8');
  const source = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
  );
  const declarations: Declaration[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isMethodDeclaration(node)) {
      const decorators = ts.getDecorators?.(node) ?? [];
      const names = decorators.map(calleeName);
      const route = decorators.find((decorator) =>
        ROUTE_DECORATORS.has(calleeName(decorator) ?? ''),
      );
      const routeArg = route ? callOf(route)?.arguments[0] : undefined;

      decorators.forEach((decorator) => {
        const name = calleeName(decorator);

        if (name !== 'AdminSection' && name !== 'AdminAction') {
          return;
        }

        const { line } = source.getLineAndCharacterOfPosition(
          decorator.getStart(),
        );

        declarations.push({
          kind: name,
          where: `${filePath}:${line + 1}`,
          verb: route ? (calleeName(route) ?? '') : '',
          routePath:
            routeArg && ts.isStringLiteralLike(routeArg) ? routeArg.text : '',
          hasCapability: names.includes('Capability'),
          fields: literalFields(callOf(decorator)?.arguments[0]),
        });
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return { declarations, usesDevOnlyGuard: /\bDevOnlyGuard\b/.test(text) };
}

export function adminContractViolations(files: string[]): string[] {
  const violations: string[] = [];
  const all: Declaration[] = [];

  for (const file of files) {
    const { declarations, usesDevOnlyGuard } = declarationsOf(file);

    if (declarations.length > 0 && usesDevOnlyGuard) {
      violations.push(
        `${file} — contributes to the admin but uses DevOnlyGuard, so the route stops existing in production; use @AdminStudio() or the route's own guards`,
      );
    }

    all.push(...declarations);
  }

  const sectionIds = new Map<string, string>();
  const actionIds = new Map<string, string>();

  for (const declaration of all) {
    const { kind, where, fields } = declaration;
    const id = fields.get('id');
    const seen = kind === 'AdminSection' ? sectionIds : actionIds;

    if (declaration.verb === '') {
      violations.push(`${where} — @${kind} is not on a route handler`);
    }

    if (!declaration.hasCapability) {
      violations.push(
        `${where} — @${kind} route carries no @Capability(...), so the admin could not tell whether to offer it`,
      );
    }

    if (id === undefined || !IDENTIFIER.test(id)) {
      violations.push(
        `${where} — @${kind} needs a literal kebab-case id (got ${id ?? 'none'})`,
      );
    } else if (seen.has(id)) {
      violations.push(
        `${where} — @${kind} id "${id}" is already used at ${seen.get(id)}`,
      );
    } else {
      seen.set(id, where);
    }

    if ((fields.get('title') ?? '').trim() === '') {
      violations.push(`${where} — @${kind} needs a literal, non-empty title`);
    }

    const icon = fields.get('icon');

    if (
      icon === undefined ||
      !(ADMIN_ICONS as readonly string[]).includes(icon)
    ) {
      violations.push(
        `${where} — @${kind} icon "${icon ?? ''}" is not one of: ${ADMIN_ICONS.join(', ')}`,
      );
    }

    if (kind === 'AdminSection') {
      const isList =
        (declaration.verb === 'Get' && !declaration.routePath.includes(':')) ||
        (declaration.verb === 'Post' &&
          declaration.routePath.endsWith('search'));

      if (declaration.verb !== '' && !isList) {
        violations.push(
          `${where} — @AdminSection belongs on a list route: an argument-free GET or a POST ending in /search`,
        );
      }

      if ((fields.get('group') ?? '').trim() === '') {
        violations.push(`${where} — @AdminSection needs a literal group`);
      }
    } else {
      const scope = fields.get('scope') ?? '';

      if (!SCOPES.has(scope)) {
        violations.push(
          `${where} — @AdminAction scope must be one of: ${[...SCOPES].join(', ')}`,
        );
      }

      if (declaration.verb === 'Get') {
        violations.push(
          `${where} — @AdminAction must not be a GET: an action changes something, and a GET is repeated by prefetchers and crawlers`,
        );
      }

      if (scope === 'row' && !declaration.routePath.includes(':id')) {
        violations.push(
          `${where} — a row action needs ":id" in its route path so the admin knows which row it is for`,
        );
      }
    }
  }

  for (const declaration of all) {
    const section = declaration.fields.get('section');

    if (
      declaration.kind === 'AdminAction' &&
      section !== undefined &&
      !sectionIds.has(section)
    ) {
      violations.push(
        `${declaration.where} — @AdminAction names section "${section}", which no @AdminSection declares`,
      );
    }
  }

  return violations;
}

export function checkAdminContract(): boolean {
  const repoRoot = path.resolve(__dirname, '..');
  const files = ROOTS.flatMap((root) => {
    const dir = path.join(repoRoot, root);

    return existsSync(dir) ? controllerFiles(dir) : [];
  });
  const violations = adminContractViolations(files);

  if (violations.length > 0) {
    console.error('Admin contributions that break the contract:\n');
    violations.forEach((violation) => console.error(`  ${violation}`));
    console.error(
      '\nSee docs/src/content/docs/guides/admin.md, "Contributing a section and an action".',
    );
    return false;
  }

  console.log(
    `✔ every @AdminSection and @AdminAction honours the admin contract (${files.length} controllers checked)`,
  );

  return true;
}
