import { defineHeryModule, loginHandlerOptions } from '@heryjs/core/modules';
import { OAuthModule } from './oauth.module';
import type { OAuthLoginHandler } from './oauth-login.handler';

export default defineHeryModule({
  name: '@heryjs/oauth',
  module: (options) => OAuthModule.forRoot(options),
  options: loginHandlerOptions<OAuthLoginHandler>(),
  prisma: {
    models: ['OauthIdentity'],
    annotations: ['@hery.tenantFree'],
  },
  extensionPoints: ['auth.loginHandler'],
});
