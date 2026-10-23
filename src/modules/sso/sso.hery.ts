import { defineHeryModule, loginHandlerOptions } from '@heryjs/core/modules';
import { SsoModule } from './sso.module';
import type { SsoLoginHandler } from './sso-login.handler';

export default defineHeryModule({
  name: '@heryjs/sso',
  module: (options) => SsoModule.forRoot(options),
  options: loginHandlerOptions<SsoLoginHandler>(),
  prisma: {
    models: ['SsoConnection', 'SsoDomain', 'SsoIdentity'],
    annotations: ['@hery.appEnforcedTenant'],
  },
  extensionPoints: ['auth.loginHandler'],
});
