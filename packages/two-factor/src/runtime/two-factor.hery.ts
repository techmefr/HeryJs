import { defineHeryModule, noOptions } from '@heryjs/core/modules';
import { TwoFactorModule } from './two-factor.module';

export default defineHeryModule({
  name: '@heryjs/two-factor',
  module: () => TwoFactorModule,
  options: noOptions,
  prisma: {
    models: [
      'TwoFactorEnrolment',
      'TwoFactorRecoveryCode',
      'TwoFactorRoleRequirement',
      'TwoFactorVerifiedSession',
    ],
    annotations: ['@hery.tenantScoped'],
  },
  extensionPoints: ['auth.challenge'],
});
