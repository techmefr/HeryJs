import { defineHeryModule, noOptions } from '@heryjs/core/modules';
import { ScimModule } from './scim.module';

export default defineHeryModule({
  name: '@heryjs/scim',
  module: () => ScimModule,
  options: noOptions,
  prisma: {
    models: ['ScimToken', 'ScimIdentity'],
    annotations: ['@hery.appEnforcedTenant', '@hery.tenantScoped'],
  },
  extensionPoints: ['auth.provisioning'],
});
