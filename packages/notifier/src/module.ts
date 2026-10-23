import type { ModuleDefinition } from 'heryjs';

const NOTIFICATION_PREFERENCE_MODELS = `
/// @hery.tenantScoped
model NotificationPreference {
  id        String   @id @default(cuid())
  tenantId  String
  userId    String
  channel   String
  type      String
  enabled   Boolean  @default(true)
  digest    Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, channel, type])
  @@index([tenantId])
}

/// @hery.tenantScoped
model NotificationSetting {
  id              String   @id @default(cuid())
  tenantId        String
  userId          String   @unique
  timezone        String   @default("UTC")
  quietHoursStart String?
  quietHoursEnd   String?
  digestHour      Int      @default(8)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([tenantId])
}

/// @hery.appEnforcedTenant Staged inside the transaction of the write it describes, and drained by a relay with no request behind it, so it can be neither stamped nor filtered by the ambient tenant.
model NotificationDigestEntry {
  id        String   @id @default(cuid())
  tenantId  String
  userId    String
  email     String
  type      String
  subject   String
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([userId])
}
`;

export default {
  name: 'notifier',
  description:
    'Notify a recipient by whatever channel they have agreed to: one notification class rendered once per channel over mail, sms, push and in-app, honouring per-channel and per-type preferences, quiet hours and digests, with a per-channel result instead of one verdict.',
  meta: { compatibility: '>=0.0.1' },
  dependencies: [],
  install(context) {
    context.copyRuntime();
    context.addPrismaModels(NOTIFICATION_PREFERENCE_MODELS);
    context.addModelFields('User', [
      '  notificationPreferences NotificationPreference[]',
      '  notificationSetting NotificationSetting?',
      '  notificationDigestEntries NotificationDigestEntry[]',
    ]);

    context.nextSteps([
      'Run "pnpm hery migrate --name add_notification_preferences"',
      'Install "mail", "sms" and "push" first if you have not already -- the notifier composes them rather than replacing them',
      'Write a notification class implementing "toMail", "toSms" and/or "toPush" from "#modules/notifier/notification", each returning the same rendered-message shape its channel already accepts',
      'Set "type" on each notification class (preferences are keyed on it) and "isMandatory = true" on the transactional ones -- a password reset or an invoice -- that no preference may suppress',
      "Users read and change their own rules and quiet hours through GET /notification-preferences, PUT /notification-preferences/rules and PUT /notification-preferences/settings; a scheduled job sends held mail digests hourly at each user's chosen local hour",
      'Inject "NotifierService" and call ".send(recipient, new YourNotification())" -- it never throws for a single channel failing, and reports each channel\'s outcome instead',
    ]);
  },
} satisfies ModuleDefinition;
