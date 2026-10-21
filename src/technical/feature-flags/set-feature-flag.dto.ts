import { z } from 'zod';

export const featureFlagRuleSchema = z.object({
  attribute: z
    .string()
    .regex(/^[A-Za-z][\w.-]{0,63}$/, 'Use letters, digits, ".", "_" or "-"'),
  operator: z.enum(['in', 'notIn']),
  values: z.array(z.string().min(1).max(200)).min(1).max(100),
  serve: z.boolean(),
});

export const setFeatureFlagSchema = z.object({
  enabled: z.boolean().optional(),
  rolloutPercentage: z.number().int().min(0).max(100).optional(),
  rolloutBy: z.enum(['user', 'tenant']).optional(),
  rules: z.array(featureFlagRuleSchema).max(50).optional(),
  tenantId: z.string().min(1).nullable().optional(),
});

export type SetFeatureFlagDto = z.infer<typeof setFeatureFlagSchema>;

export const evaluateFeatureFlagSchema = z.object({
  key: z.string().min(1),
  tenantId: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
  plan: z.string().min(1).optional(),
  attributes: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
});

export type EvaluateFeatureFlagDto = z.infer<typeof evaluateFeatureFlagSchema>;
