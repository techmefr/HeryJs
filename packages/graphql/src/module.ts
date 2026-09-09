import type { ModuleDefinition } from 'heryjs';

export default {
  name: 'graphql',
  description:
    'Add a GraphQL endpoint (Apollo driver) with a session guard mirroring the REST auth flow. Use "hery generate <Name> --graphql" to add a resolver to a resource.',
  meta: { compatibility: '>=0.0.1' },
  dest: 'src/technical',
  dependencies: [
    '@nestjs/graphql',
    '@nestjs/apollo',
    '@apollo/server',
    '@as-integrations/express5',
    'graphql',
  ],
  install(context) {
    context.copyRuntime();

    context.nextSteps([
      `Import "GraphqlModule" into src/app.module.ts`,
      'Run "hery generate <Name> --graphql" to add a resolver to a resource',
    ]);
  },
} satisfies ModuleDefinition;
