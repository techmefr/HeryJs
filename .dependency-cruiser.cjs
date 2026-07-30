/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-cross-domain-imports',
      comment:
        'A functional domain must not import directly from another functional domain. Shared logic belongs in technical/.',
      severity: 'error',
      from: {
        path: '^src/functional/([^/]+)/',
      },
      to: {
        path: '^src/functional/([^/]+)/',
        pathNot: '^src/functional/$1/',
      },
    },
    {
      name: 'no-infrastructure-to-functional',
      comment:
        'technical/, modules/ and devtools/ are infrastructure and must not depend on business domains. Pass the value in from the caller instead.',
      severity: 'error',
      from: {
        path: '^src/(technical|modules|devtools)/',
      },
      to: {
        path: '^src/functional/',
      },
    },
    {
      name: 'no-kernel-to-module',
      comment:
        'technical/ is the kernel and is never optional, so it must not depend on a module that can be uninstalled. Only app.module.ts composes the two.',
      severity: 'error',
      from: {
        path: '^src/technical/',
      },
      to: {
        path: '^src/modules/',
      },
    },
    {
      name: 'no-cross-module-imports',
      comment:
        'A module must not import another module directly, or uninstalling one would break the other. Shared logic belongs in technical/.',
      severity: 'error',
      from: {
        path: '^src/modules/([^/]+)/',
      },
      to: {
        path: '^src/modules/([^/]+)/',
        pathNot: '^src/modules/$1/',
      },
    },
    {
      name: 'no-production-to-devtools',
      comment:
        'devtools/ never ships to production, so nothing but a spec file may reach into it. This is the rule check-no-inline-dev-guard.ts used to approximate by grep.',
      severity: 'error',
      from: {
        path: '^src/(technical|functional|modules)/',
        pathNot: '\\.spec\\.ts$',
      },
      to: {
        path: '^src/devtools/',
      },
    },
    {
      name: 'no-circular',
      comment: 'Circular dependencies make modules hard to reason about and to generate around.',
      severity: 'error',
      from: {},
      to: {
        circular: true,
      },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    exclude: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
