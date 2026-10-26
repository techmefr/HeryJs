import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  EMPTY_REGISTRY,
  contractIdentifier,
  contractSpecifier,
  declareModule,
  declaredModules,
  registerContract,
  undeclareModule,
  unregisterContract,
  unwireDeclaredModule,
  wireModule,
} from './hery-config-patch';

const CONFIG = `import type { HeryConfig } from './src/technical/config/hery-config.types';

export default {
  cache: {
    defaultTtlSeconds: 300,
  },
} satisfies HeryConfig;
`;

describe('hery.config.ts modules', () => {
  it('creates the modules array on the first install, then appends', () => {
    const once = declareModule(CONFIG, '@heryjs/sso');
    const twice = declareModule(once, '@heryjs/mail');

    expect(once).toContain(
      "export default {\n  modules: [\n    '@heryjs/sso',\n  ],\n  cache:",
    );
    expect(declaredModules(twice)).toEqual(['@heryjs/sso', '@heryjs/mail']);
    expect(declareModule(twice, '@heryjs/sso')).toBe(twice);
  });

  it('leaves a module declared with options as it is', () => {
    const config = CONFIG.replace(
      'export default {\n',
      "export default {\n  modules: [['@heryjs/sso', { loginHandler: Handler }]],\n",
    );

    expect(declareModule(config, '@heryjs/sso')).toBe(config);
  });

  it('takes a module back out, bare or with options', () => {
    const config = declareModule(
      declareModule(CONFIG, '@heryjs/sso'),
      '@heryjs/mail',
    );

    expect(declaredModules(undeclareModule(config, '@heryjs/sso'))).toEqual([
      '@heryjs/mail',
    ]);
    expect(
      undeclareModule(
        "  modules: [\n    ['@heryjs/sso', { loginHandler: Handler }],\n    '@heryjs/mail',\n  ],\n",
        '@heryjs/sso',
      ),
    ).toBe("  modules: [\n    '@heryjs/mail',\n  ],\n");
  });
});

describe('src/hery.modules.ts', () => {
  it('names a contract after its module and imports it from where it landed', () => {
    expect(contractIdentifier('two-factor')).toBe('twoFactorHeryModule');
    expect(contractSpecifier('src/modules/billing', 'billing-stripe')).toBe(
      '#modules/billing/billing-stripe.hery',
    );
  });

  it('registers and unregisters a contract', () => {
    const registered = registerContract(
      registerContract(
        EMPTY_REGISTRY,
        'ssoHeryModule',
        '#modules/sso/sso.hery',
      ),
      'mailHeryModule',
      '#modules/mail/mail.hery',
    );

    expect(registered)
      .toBe(`import type { HeryModuleContract } from '@heryjs/core/modules';
import ssoHeryModule from '#modules/sso/sso.hery';
import mailHeryModule from '#modules/mail/mail.hery';

export const heryModules: HeryModuleContract[] = [
  ssoHeryModule,
  mailHeryModule,
];
`);
    expect(
      registerContract(registered, 'ssoHeryModule', '#modules/sso/sso.hery'),
    ).toBe(registered);
    expect(
      unregisterContract(
        unregisterContract(registered, 'ssoHeryModule'),
        'mailHeryModule',
      ),
    ).toBe(EMPTY_REGISTRY);
  });
});

describe('wireModule', () => {
  function project(): string {
    const root = mkdtempSync(path.join(tmpdir(), 'hery-wire-'));
    mkdirSync(path.join(root, 'src', 'modules', 'sso'), { recursive: true });
    writeFileSync(path.join(root, 'hery.config.ts'), CONFIG);

    return root;
  }

  const sso = {
    name: '@heryjs/sso',
    moduleName: 'sso',
    dest: 'src/modules/sso',
  };

  it('declares a module whose runtime ships a contract, then undeclares it', () => {
    const root = project();
    writeFileSync(path.join(root, 'src', 'modules', 'sso', 'sso.hery.ts'), '');

    expect(wireModule(root, sso)).toEqual([
      'hery.config.ts',
      path.join('src', 'hery.modules.ts'),
    ]);
    expect(
      declaredModules(readFileSync(path.join(root, 'hery.config.ts'), 'utf8')),
    ).toEqual(['@heryjs/sso']);
    expect(wireModule(root, sso)).toEqual([]);

    unwireDeclaredModule(root, sso);

    expect(
      readFileSync(path.join(root, 'src', 'hery.modules.ts'), 'utf8'),
    ).toBe(EMPTY_REGISTRY);
    expect(
      declaredModules(readFileSync(path.join(root, 'hery.config.ts'), 'utf8')),
    ).toEqual([]);
  });

  it('declares nothing for a module with no contract', () => {
    expect(wireModule(project(), sso)).toEqual([]);
  });
});
