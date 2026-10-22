import { withoutSetEntries } from './strip-example';

const REGISTRY = `export const TENANT_FREE_MODELS = new Set<string>([
  // better-auth's own tables, read through its own adapter.
  'Account',
  'Session',
  // The sso module's tables.
  'SsoConnection',
  'SsoDomain',
]);
`;

describe('withoutSetEntries on a registry written one entry per line', () => {
  it('removes only the lines of the removed entries, comments with apostrophes included', () => {
    expect(
      withoutSetEntries(
        REGISTRY,
        'TENANT_FREE_MODELS',
        new Set(['SsoConnection', 'SsoDomain']),
      ),
    ).toBe(`export const TENANT_FREE_MODELS = new Set<string>([
  // better-auth's own tables, read through its own adapter.
  'Account',
  'Session',
  // The sso module's tables.
]);
`);
  });

  it('keeps the layout a module patch anchors on', () => {
    expect(
      withoutSetEntries(REGISTRY, 'TENANT_FREE_MODELS', new Set(['SsoDomain'])),
    ).toContain("new Set<string>([\n  // better-auth's own tables");
  });

  it('empties to a typed Set once no entry is left', () => {
    expect(
      withoutSetEntries(
        REGISTRY,
        'TENANT_FREE_MODELS',
        new Set(['Account', 'Session', 'SsoConnection', 'SsoDomain']),
      ),
    ).toContain('new Set<string>([])');
  });
});
