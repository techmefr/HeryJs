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
      name: 'no-technical-to-functional',
      comment: 'technical/ is shared infrastructure and must not depend on business domains.',
      severity: 'error',
      from: {
        path: '^src/technical/',
      },
      to: {
        path: '^src/functional/',
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
