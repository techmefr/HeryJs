import { defineHeryModule, noOptions } from '@heryjs/core/modules';
import { PushModule } from './push.module';

export default defineHeryModule({
  name: '@heryjs/push',
  module: () => PushModule,
  options: noOptions,
  prisma: {
    models: ['PushToken'],
    annotations: ['@hery.tenantScoped'],
  },
  extensionPoints: ['push.driver'],
});
