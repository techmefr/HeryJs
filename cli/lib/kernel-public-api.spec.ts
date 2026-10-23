import { readdirSync } from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import { KERNEL_PUBLIC_DIR, KERNEL_PUBLIC_ENTRIES } from './kernel-public-api';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PUBLIC_DIR = path.join(REPO_ROOT, KERNEL_PUBLIC_DIR);

function entryFile(entry: string): string {
  return path.join(PUBLIC_DIR, `${entry}.ts`);
}

function exportedNames(): Record<string, string[]> {
  const program = ts.createProgram(KERNEL_PUBLIC_ENTRIES.map(entryFile), {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    experimentalDecorators: true,
    skipLibCheck: true,
    noEmit: true,
  });
  const checker = program.getTypeChecker();

  return Object.fromEntries(
    KERNEL_PUBLIC_ENTRIES.map((entry) => {
      const source = program.getSourceFile(entryFile(entry));
      const moduleSymbol =
        source === undefined ? undefined : checker.getSymbolAtLocation(source);
      const names = (
        moduleSymbol === undefined
          ? []
          : checker.getExportsOfModule(moduleSymbol)
      ).map((symbol) => {
        const target =
          symbol.flags & ts.SymbolFlags.Alias
            ? checker.getAliasedSymbol(symbol)
            : symbol;
        const kind = target.flags & ts.SymbolFlags.Value ? 'value' : 'type';

        return `${symbol.getName()}: ${kind}`;
      });

      return [entry, names.sort()];
    }),
  );
}

describe('the kernel public API', () => {
  it('has one file per declared entry and no other', () => {
    const files = readdirSync(PUBLIC_DIR)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
      .map((file) => file.replace(/\.ts$/, ''))
      .sort();

    expect(files).toEqual([...KERNEL_PUBLIC_ENTRIES].sort());
  });

  // A removed or renamed export shows as a changed line in the snapshot file,
  // which is what turns a breaking change into something a reviewer reads.
  it('exports exactly the recorded names', () => {
    const names = exportedNames();

    Object.entries(names).forEach(([entry, exported]) => {
      expect([entry, exported.length > 0]).toEqual([entry, true]);
    });
    expect(names).toMatchSnapshot();
  });
});
