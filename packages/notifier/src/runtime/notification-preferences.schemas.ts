import { z } from 'zod';
import { isValidTimezone, parseTimeOfDay } from './local-time';
import {
  ALL_TYPES,
  DIGEST_CHANNEL,
  NOTIFIER_CHANNELS,
} from './notification-rules';

const MAX_TYPE_LENGTH = 100;
const MAX_RULES_PER_REQUEST = 50;
const LAST_HOUR = 23;

const channelSchema = z.enum(NOTIFIER_CHANNELS);

const timeOfDaySchema = z
  .string()
  .refine((value) => parseTimeOfDay(value) !== null, 'Expected HH:mm');

const ruleSchema = z
  .object({
    channel: channelSchema,
    type: z.string().min(1).max(MAX_TYPE_LENGTH).default(ALL_TYPES),
    enabled: z.boolean(),
    digest: z.boolean().default(false),
  })
  .strict()
  .refine(
    (rule) => !rule.digest || rule.channel === DIGEST_CHANNEL,
    `Only ${DIGEST_CHANNEL} can be collected into a digest`,
  )
  .refine(
    (rule) => rule.enabled || !rule.digest,
    'A disabled rule cannot also be a digest',
  );

export const saveRulesSchema = z
  .object({ rules: z.array(ruleSchema).min(1).max(MAX_RULES_PER_REQUEST) })
  .strict();

export const resetRuleParamsSchema = z.object({
  channel: channelSchema,
  type: z.string().min(1).max(MAX_TYPE_LENGTH),
});

export const saveSettingsSchema = z
  .object({
    timezone: z.string().refine(isValidTimezone, 'Unknown timezone'),
    quietHoursStart: timeOfDaySchema.nullable(),
    quietHoursEnd: timeOfDaySchema.nullable(),
    digestHour: z.number().int().min(0).max(LAST_HOUR),
  })
  .strict()
  .refine(
    (settings) =>
      (settings.quietHoursStart === null) === (settings.quietHoursEnd === null),
    'Quiet hours need both a start and an end',
  )
  .refine(
    (settings) =>
      settings.quietHoursStart === null ||
      settings.quietHoursStart !== settings.quietHoursEnd,
    'Quiet hours cannot start and end at the same time',
  );
