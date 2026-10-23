import { defineHeryModule, noOptions } from '@heryjs/core/modules';
import { ImpersonationModule } from './impersonation.module';

export default defineHeryModule({
  name: '@heryjs/impersonation',
  module: () => ImpersonationModule,
  options: noOptions,
  extensionPoints: ['auth.session'],
});
