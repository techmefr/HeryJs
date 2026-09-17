import type { ModuleDefinition } from 'heryjs';

const SMS_CONSENT_MODEL = `
model SmsConsent {
  id        String   @id @default(cuid())
  tenantId  String
  phone     String
  granted   Boolean
  source    String
  createdAt DateTime @default(now())

  @@index([tenantId, phone, createdAt])
}
`;

export default {
  name: 'sms',
  description:
    'Send SMS behind one contract, with the per-country rules that decide whether a message is legal before a provider silently accepts it.',
  meta: { compatibility: '>=0.0.1' },
  dependencies: [],
  install(context) {
    context.copyRuntime();
    context.addPrismaModels(SMS_CONSENT_MODEL);

    context.nextSteps([
      'Run "pnpm hery migrate --name add_sms_consent"',
      'Import "SmsModule" into src/app.module.ts',
      "Declare it in hery.config.ts, e.g. { sms: { default: process.env.SMS_DRIVER ?? 'log', drivers: { log: { driver: 'log' } } } }",
      'Record consent with SmsConsentService.grant(phone, source) wherever a number opts in -- nothing marketing sends without it',
      'Send with SmsService.send(sendable, { kind: "transactional" | "marketing" })',
    ]);
  },
} satisfies ModuleDefinition;
