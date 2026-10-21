import { createHash } from 'node:crypto';

export type RolloutBy = 'user' | 'tenant';

export interface FeatureFlagRule {
  /**
   * `tenant`, `user` and `plan` read the matching context field; any other
   * name reads the same key of `context.attributes`.
   */
  attribute: string;
  operator: 'in' | 'notIn';
  values: string[];
  serve: boolean;
}

/**
 * Who a flag is being evaluated for. A plain tenant id is still accepted
 * wherever a context is, so a call site written before targeting existed
 * keeps working.
 */
export interface FeatureFlagContext {
  tenantId?: string;
  userId?: string;
  plan?: string;
  attributes?: Record<string, string | number | boolean>;
}

export interface FeatureFlagSettings {
  enabled: boolean;
  rolloutPercentage: number;
  rolloutBy: RolloutBy;
  rules: FeatureFlagRule[];
}

export type EvaluationReason =
  | 'not-found'
  | 'disabled'
  | 'rule'
  | 'rollout'
  | 'no-subject'
  | 'everyone'
  | 'provider';

export interface FeatureFlagEvaluation {
  enabled: boolean;
  reason: EvaluationReason;
  /** Index of the rule that decided, when `reason` is `rule`. */
  ruleIndex?: number;
  /** The 0-99 bucket the subject landed in, when a percentage decided. */
  bucket?: number;
}

export function contextOf(
  context?: string | FeatureFlagContext,
): FeatureFlagContext {
  return typeof context === 'string' ? { tenantId: context } : (context ?? {});
}

/**
 * Stable per subject and per flag: the same user always lands in the same
 * bucket for one flag, and a different bucket for another, so being early in
 * every rollout is not a property of the unluckiest user. A raising
 * percentage only ever adds subjects, because a subject is in whenever its
 * bucket is below the percentage.
 */
export function bucketOf(key: string, subject: string): number {
  const digest = createHash('sha256').update(`${key}:${subject}`).digest();

  return digest.readUInt32BE(0) % 100;
}

function valueOf(
  rule: FeatureFlagRule,
  context: FeatureFlagContext,
): string | undefined {
  switch (rule.attribute) {
    case 'tenant':
      return context.tenantId;
    case 'user':
      return context.userId;
    case 'plan':
      return context.plan;
    default: {
      const value = context.attributes?.[rule.attribute];

      return value === undefined ? undefined : String(value);
    }
  }
}

function matches(rule: FeatureFlagRule, context: FeatureFlagContext): boolean {
  const value = valueOf(rule, context);

  // A rule about an attribute the caller did not supply says nothing about
  // them, in either direction, so it never matches rather than matching every
  // "notIn".
  if (value === undefined) {
    return false;
  }

  const listed = rule.values.includes(value);

  return rule.operator === 'in' ? listed : !listed;
}

/**
 * The evaluation order, and the only place it is written down:
 *
 * 1. no flag row at all: off
 * 2. `enabled` false: off, whatever else is configured (the kill switch)
 * 3. targeting rules, in order: the first rule that matches decides
 * 4. the percentage, bucketed by user or by tenant: in when the subject's
 *    bucket is below it. 100 is everyone and 0 is no one.
 *
 * Pure and clock-free, which is what makes it testable and keeps an answer
 * the same on every instance of the API.
 */
export function evaluateFlag(
  settings: FeatureFlagSettings | null,
  key: string,
  context: FeatureFlagContext,
): FeatureFlagEvaluation {
  if (!settings) {
    return { enabled: false, reason: 'not-found' };
  }

  if (!settings.enabled) {
    return { enabled: false, reason: 'disabled' };
  }

  for (const [ruleIndex, rule] of settings.rules.entries()) {
    if (matches(rule, context)) {
      return { enabled: rule.serve, reason: 'rule', ruleIndex };
    }
  }

  if (settings.rolloutPercentage >= 100) {
    return { enabled: true, reason: 'everyone' };
  }

  const subject =
    settings.rolloutBy === 'tenant'
      ? context.tenantId
      : (context.userId ?? context.tenantId);

  if (!subject) {
    return { enabled: false, reason: 'no-subject' };
  }

  const bucket = bucketOf(key, subject);

  return {
    enabled: bucket < settings.rolloutPercentage,
    reason: 'rollout',
    bucket,
  };
}
