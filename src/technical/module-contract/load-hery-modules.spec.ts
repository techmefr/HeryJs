import * as path from 'node:path';
import { applicationEntry, loadHeryModules } from './load-hery-modules';
import { resolveHeryModules } from './resolve-hery-modules';

describe('loadHeryModules', () => {
  it('loads each declared module from its package by name', () => {
    const contracts = loadHeryModules(['@heryjs/sse', ['@heryjs/storage', {}]]);

    expect(contracts.map((contract) => contract.name)).toEqual([
      '@heryjs/sse',
      '@heryjs/storage',
    ]);
  });

  it('resolves them from the application entry, not the working directory', () => {
    expect(
      applicationEntry({ filename: '/app/dist/src/main.js' }, '/elsewhere'),
    ).toBe('/app/dist/src/main.js');
  });

  it('falls back to the working directory when node started no entry', () => {
    expect(applicationEntry(undefined, '/app')).toBe(
      path.join('/app', 'package.json'),
    );
  });

  it('leaves out a module that is not installed, for the resolver to name', () => {
    const missing = Object.assign(
      new Error("Cannot find module '@acme/absent/hery'"),
      { code: 'MODULE_NOT_FOUND' },
    );
    const contracts = loadHeryModules(['@acme/absent'], () => {
      throw missing;
    });

    expect(contracts).toEqual([]);
    expect(() => resolveHeryModules(['@acme/absent'], contracts)).toThrow(
      /@acme\/absent: unknown module, it is not installed/,
    );
  });

  it('does not hide a module that fails while loading', () => {
    expect(() =>
      loadHeryModules(['@acme/broken'], () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
  });
});
