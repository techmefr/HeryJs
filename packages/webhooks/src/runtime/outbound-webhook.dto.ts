import { z } from 'zod';
import {
  DELIVERY_STATUSES,
  MAX_EVENTS_PER_SUBSCRIPTION,
} from './outbound-webhook.constants';
import { isDeliverablePattern } from './webhook-event-pattern';

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

const eventPatternSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_.:*-]+$/)
  .refine(isDeliverablePattern, {
    message: 'must name a webhook.* or model.* event, or use *',
  });

const eventsSchema = z
  .array(eventPatternSchema)
  .min(1)
  .max(MAX_EVENTS_PER_SUBSCRIPTION);

export const createSubscriptionSchema = z.object({
  url: z.string().min(1).max(2048),
  events: eventsSchema,
  description: z.string().max(200).optional(),
});

export const updateSubscriptionSchema = z.object({
  url: z.string().min(1).max(2048).optional(),
  events: eventsSchema.optional(),
  description: z.string().max(200).nullable().optional(),
  active: z.boolean().optional(),
});

export const rotateSecretSchema = z.object({
  graceSeconds: z.number().int().min(0).max(SEVEN_DAYS_SECONDS).optional(),
});

export const deliveryFilterSchema = z.object({
  status: z.enum(DELIVERY_STATUSES).optional(),
  subscriptionId: z.string().min(1).max(100).optional(),
});

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;
export type RotateSecretInput = z.infer<typeof rotateSecretSchema>;
export type DeliveryFilter = z.infer<typeof deliveryFilterSchema>;
