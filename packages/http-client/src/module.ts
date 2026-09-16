import type { ModuleDefinition } from 'heryjs';

export default {
  name: 'http-client',
  description:
    "Call other people's APIs behind one contract: a retrying ofetch driver, and a fake driver that records every request and refuses to reach the network in tests.",
  meta: { compatibility: '>=0.0.1' },
  dependencies: ['ofetch'],
  install(context) {
    context.copyRuntime();

    context.nextSteps([
      'Import "HttpClientModule" into src/app.module.ts',
      'Inject "HttpClientService" and call ".get()"/".post()" from any resource that talks to a third party',
      "Declare the driver in hery.config.ts, e.g. { httpClient: { default: process.env.HTTP_CLIENT_DRIVER ?? 'fake', drivers: { fake: { driver: 'fake' }, ofetch: { driver: 'ofetch' } } } }",
      'Import "OfetchHttpClientModule" into src/app.module.ts as well, so the ofetch driver has a provider to resolve',
      'Leave the fake driver active under test: it records every request and throws on an endpoint nobody stubbed, instead of reaching a real vendor from CI',
    ]);
  },
} satisfies ModuleDefinition;
