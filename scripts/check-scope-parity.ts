import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

const SCOPE_HELPER = 'scopeWhereFor';

// Every helper that turns a permission preset into a decision or a filter. All
// of them have to read the resource's presets object -- a literal here is a
// second declaration, and a second declaration is what drifts.
const PRESET_HELPERS = new Set([
  SCOPE_HELPER,
  'resolveCapability',
  'resolveCollectionCapability',
]);

// CapabilitiesService.resolve takes a preset too, but "resolve" on its own is a
// common enough method name -- the search engine registry has one -- that only
// this exact receiver counts.
const PRESET_METHOD = 'this.capabilities.resolve';

const PRESETS_SUFFIX = '_PRESETS';

// Resources live in src/functional in a real project, and the repo's own example
// lives in examples/. Both are scanned so the example cannot drift out of the
// conventions it is supposed to demonstrate.
const RESOURCE_ROOTS = ['src/functional', 'examples'];

function resourceFilesIn(collect: (dir: string) => string[]): string[] {
  const repoRoot = path.resolve(__dirname, '..');

  return RESOURCE_ROOTS.flatMap((relative) => {
    const dir = path.join(repoRoot, relative);

    return existsSync(dir) ? collect(dir) : [];
  });
}

function findPresetConsumers(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return findPresetConsumers(fullPath);
    }

    return entry.name.endsWith('.service.ts') ||
      entry.name.endsWith('.policy.ts')
      ? [fullPath]
      : [];
  });
}

function presetHelperName(call: ts.CallExpression): string | undefined {
  const callee = call.expression;

  if (ts.isIdentifier(callee)) {
    return PRESET_HELPERS.has(callee.text) ? callee.text : undefined;
  }

  if (!ts.isPropertyAccessExpression(callee)) {
    return undefined;
  }

  return callee.getText() === PRESET_METHOD ? PRESET_METHOD : undefined;
}

// 'own' as an argument, or a constant that only looks like the presets object.
// The reason a call is reported matters more than the fact that it is: a
// literal and a stray identifier are different mistakes.
function presetArgumentProblem(argument: ts.Expression): string | undefined {
  if (ts.isStringLiteral(argument)) {
    return `passes the literal '${argument.text}'`;
  }

  if (!ts.isPropertyAccessExpression(argument)) {
    return `passes ${argument.getText()}`;
  }

  const owner = argument.expression;

  if (!ts.isIdentifier(owner) || !owner.text.endsWith(PRESETS_SUFFIX)) {
    return `reads ${argument.getText()}, which is not the resource's presets object`;
  }

  return undefined;
}

interface FileReport {
  violations: string[];
  scopedSearch: boolean;
  hasSearch: boolean;
}

function checkFile(filePath: string): FileReport {
  const source = ts.createSourceFile(
    filePath,
    readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );

  const report: FileReport = {
    violations: [],
    scopedSearch: false,
    hasSearch: false,
  };

  const lineOf = (node: ts.Node) =>
    source.getLineAndCharacterOfPosition(node.getStart()).line + 1;

  const visit = (node: ts.Node, insideSearch: boolean) => {
    if (ts.isMethodDeclaration(node) && node.name.getText() === 'search') {
      report.hasSearch = true;
      ts.forEachChild(node, (child) => visit(child, true));

      if (!report.scopedSearch) {
        report.violations.push(
          `${filePath}:${lineOf(node)} — "search" never narrows its rows with ${SCOPE_HELPER}(...)`,
        );
      }

      return;
    }

    if (ts.isCallExpression(node)) {
      const name = presetHelperName(node);
      const argument = node.arguments[0];

      if (name !== undefined && argument) {
        const problem = presetArgumentProblem(argument);

        if (problem) {
          report.violations.push(
            `${filePath}:${lineOf(node)} — ${name}(...) ${problem} instead of the resource's <NAME>${PRESETS_SUFFIX} entry`,
          );
        } else if (insideSearch && name === SCOPE_HELPER) {
          report.scopedSearch = true;
        }
      }
    }

    ts.forEachChild(node, (child) => visit(child, insideSearch));
  };

  visit(source, false);

  return report;
}

export function checkScopeParity(): boolean {
  const files = resourceFilesIn(findPresetConsumers);

  if (files.length === 0) {
    // This repository always ships examples/, so an empty scan here means
    // something got silently emptied. A project scaffolded by `hery new` never
    // has examples/ at all and starts with zero resources on purpose — that is
    // not the regression this check exists to catch.
    if (existsSync(path.resolve(__dirname, '..', 'examples'))) {
      console.error(
        `Found no resource service or policy under ${RESOURCE_ROOTS.join(' or ')}. This check reports
success on an empty scan, so an empty scan has to be the failure instead.`,
      );
      return false;
    }

    console.log(
      '✔ no resource service yet (no examples/ directory — this is a scaffolded project, not the framework repo)',
    );
    return true;
  }

  const reports = files.map(checkFile);
  const violations = reports.flatMap((report) => report.violations);

  if (violations.length > 0) {
    console.error('Permission presets read from more than one place:\n');
    violations.forEach((violation) => console.error(`  ${violation}`));
    console.error(
      "\nThe detail route resolves a preset against a loaded record; the collection\nquery has to narrow the rows with that same preset. Both read the resource's\n<NAME>_PRESETS object so there is one declaration and nothing to keep in sync.\nA literal recreates the second declaration this check exists to prevent: written\napart, the two drift and the list hands out what the detail route refuses.",
    );
    return false;
  }

  const searches = reports.filter((report) => report.hasSearch).length;

  console.log(
    `✔ every preset is read from one declaration; ${searches} collection ${searches === 1 ? 'query scopes' : 'queries scope'} through ${SCOPE_HELPER} (${files.length} files checked)`,
  );

  return true;
}
