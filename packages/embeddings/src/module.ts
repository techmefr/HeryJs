import type { ModuleDefinition } from 'heryjs';

export default {
  name: 'embeddings',
  description:
    'Turn text into vectors behind one contract: a deterministic fake driver for tests and development, and an OpenAI-compatible HTTP driver over the built-in fetch.',
  meta: { compatibility: '>=0.0.1' },
  dependencies: [],
  install(context) {
    context.copyRuntime();

    context.nextSteps([
      'Import "EmbeddingsModule" into src/app.module.ts -- a resource with a vector field cannot boot without it',
      "Declare it in hery.config.ts, e.g. { embeddings: { default: process.env.EMBEDDINGS_DRIVER ?? 'fake', drivers: { fake: { driver: 'fake' }, openai: { driver: 'openai-compatible' } } } }",
      'Set EMBEDDINGS_DIMENSIONS to the width of the vector fields in your blueprints (default 1536)',
      'For the openai-compatible driver set EMBEDDINGS_OPENAI_BASE_URL, EMBEDDINGS_OPENAI_API_KEY and EMBEDDINGS_OPENAI_MODEL',
      'Declare a "type: vector" field with "dimensions" and "source" in a blueprint, then query it with search: { q, mode: "similar" }',
    ]);
  },
} satisfies ModuleDefinition;
