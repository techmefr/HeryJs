import { readdirSync, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import { CATALOGUE } from './catalogue';
import { FALLBACK_LOCALE, resolveSupportedLocales } from './locale.config';

const SRC = path.resolve(__dirname, '../..');

const UNTRANSLATED: Record<string, string> = {
  'capability.forbidden':
    'a security message that varies by locale is a signal about itself, so it always stays in English',
  'storage.upload.rejected':
    'free text: each caller writes its own reason, so there is no canonical string to translate',
  'storage.upload_intent.mismatch':
    'free text: each caller writes its own reason, so there is no canonical string to translate',
};

interface ThrownKey {
  className: string;
  file: string;
  translationKeys: string[] | null;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);

    if (statSync(full).isDirectory()) {
      return sourceFiles(full);
    }

    return full.endsWith('.ts') && !full.endsWith('.spec.ts') ? [full] : [];
  });
}

function literalsOf(node: ts.Expression | undefined): string[] | null {
  if (!node) {
    return null;
  }

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return [node.text];
  }

  if (ts.isConditionalExpression(node)) {
    const whenTrue = literalsOf(node.whenTrue);
    const whenFalse = literalsOf(node.whenFalse);

    return whenTrue && whenFalse ? [...whenTrue, ...whenFalse] : null;
  }

  return null;
}

function superCallOf(node: ts.ClassDeclaration): ts.CallExpression | null {
  let found: ts.CallExpression | null = null;

  const visit = (child: ts.Node): void => {
    if (
      ts.isCallExpression(child) &&
      child.expression.kind === ts.SyntaxKind.SuperKeyword
    ) {
      found = child;
      return;
    }

    ts.forEachChild(child, visit);
  };

  ts.forEachChild(node, visit);

  return found;
}

function extendsDomainException(node: ts.ClassDeclaration): boolean {
  return (node.heritageClauses ?? []).some((clause) =>
    clause.types.some(
      (type) => type.expression.getText() === 'DomainException',
    ),
  );
}

function thrownKeysOf(file: string): ThrownKey[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const keys: ThrownKey[] = [];

  ts.forEachChild(source, (node) => {
    if (!ts.isClassDeclaration(node) || !extendsDomainException(node)) {
      return;
    }

    const call = superCallOf(node);
    const args = call?.arguments ?? [];

    keys.push({
      className: node.name?.text ?? '<anonymous>',
      file: path.relative(SRC, file),
      translationKeys: literalsOf(args[4]) ?? literalsOf(args[1]),
    });
  });

  return keys;
}

function loadModuleCatalogues(): void {
  for (const file of sourceFiles(path.join(SRC, 'modules'))) {
    if (file.endsWith('.catalogue.ts')) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require(file);
    }
  }
}

describe('error catalogue completeness', () => {
  const thrown = ['technical', 'modules', 'functional']
    .map((dir) => path.join(SRC, dir))
    .flatMap((dir) => {
      try {
        return sourceFiles(dir);
      } catch {
        return [];
      }
    })
    .flatMap(thrownKeysOf);

  beforeAll(loadModuleCatalogues);

  it('finds the exceptions it is meant to check', () => {
    expect(thrown.length).toBeGreaterThan(60);
  });

  it('gives every DomainException a literal translation key', () => {
    const dynamic = thrown
      .filter((entry) => entry.translationKeys === null)
      .map((entry) => `${entry.className} (${entry.file})`);

    expect(dynamic).toEqual([]);
  });

  it.each(
    [...new Set(['fr', ...resolveSupportedLocales()])].filter(
      (locale) => locale !== FALLBACK_LOCALE,
    ),
  )('has a %s entry for every DomainException', (locale) => {
    const missing = thrown.flatMap((entry) =>
      (entry.translationKeys ?? [])
        .filter(
          (key) =>
            !(key in UNTRANSLATED) && CATALOGUE[key]?.[locale] === undefined,
        )
        .map((key) => `${key} (${entry.className})`),
    );

    expect(missing).toEqual([]);
  });

  it('only excludes keys some exception still throws', () => {
    const keys = new Set(thrown.flatMap((entry) => entry.translationKeys));

    expect(Object.keys(UNTRANSLATED).filter((key) => !keys.has(key))).toEqual(
      [],
    );
  });
});
