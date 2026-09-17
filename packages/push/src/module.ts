import type { ModuleDefinition } from 'heryjs';

const PUSH_TOKEN_MODEL = `
model PushToken {
  id         String   @id @default(cuid())
  tenantId   String
  userId     String
  token      String   @unique
  platform   String
  lastSeenAt DateTime
  createdAt  DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([tenantId, userId])
  @@index([lastSeenAt])
}
`;

export default {
  name: 'push',
  description:
    'Web and mobile push as a channel, with the device-token lifecycle that decides whether a user is actually reachable.',
  meta: { compatibility: '>=0.0.1' },
  dependencies: [],
  install(context) {
    context.copyRuntime();
    context.addPrismaModels(PUSH_TOKEN_MODEL);
    context.addModelFields('User', ['  pushTokens PushToken[]']);

    context.nextSteps([
      'Run "pnpm hery migrate --name add_push_tokens"',
      'Import "PushModule" into src/app.module.ts',
      "Declare it in hery.config.ts, e.g. { push: { default: process.env.PUSH_DRIVER ?? 'log', drivers: { log: { driver: 'log' } } } }",
      'Register a device with PushTokenService.register(userId, token, platform) when a client subscribes',
      'Sweep tokens nobody has seen in a while with PushTokenService.forgetUnseenSince(cutoff) from a scheduled task',
    ]);
  },
} satisfies ModuleDefinition;
