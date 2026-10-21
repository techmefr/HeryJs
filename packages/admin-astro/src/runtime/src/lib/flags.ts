export interface FlagRule {
  attribute: string;
  operator: 'in' | 'notIn';
  values: string[];
  serve: boolean;
}

export interface FlagRecord {
  id: string;
  key: string;
  tenantId: string | null;
  enabled: boolean;
  rolloutPercentage: number;
  rolloutBy: 'user' | 'tenant';
  rules: FlagRule[];
}

export interface FlagEvaluation {
  enabled: boolean;
  reason: string;
  ruleIndex?: number;
  bucket?: number;
}

const ATTRIBUTE = /^[A-Za-z][\w.-]{0,63}$/;

export function flagPath(key: string): string {
  return '/feature-flags/' + encodeURIComponent(key);
}

/** Comma or line separated values, trimmed, without blanks or repeats. */
export function splitValues(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[,\n]/)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

/** One `name=value` pair per line or comma, for the preview's attributes. */
export function parseAttributes(text: string): Record<string, string> {
  const attributes: Record<string, string> = {};

  for (const pair of splitValues(text)) {
    const separator = pair.indexOf('=');

    if (separator > 0) {
      attributes[pair.slice(0, separator).trim()] = pair
        .slice(separator + 1)
        .trim();
    }
  }

  return attributes;
}

/** A whole number from 0 to 100, or null when the text is not one. */
export function parsePercentage(text: string): number | null {
  const value = Number(text);

  return text.trim() !== '' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 100
    ? value
    : null;
}

/** Why a rule would be refused, so the form says so before the API does. */
export function ruleProblem(rule: FlagRule): string | null {
  if (!ATTRIBUTE.test(rule.attribute)) {
    return 'Attribute must be tenant, user, plan or a name made of letters and digits';
  }

  return rule.values.length === 0 ? 'A rule needs at least one value' : null;
}

export function describeRule(rule: FlagRule): string {
  return (
    rule.attribute +
    (rule.operator === 'in' ? ' in ' : ' not in ') +
    rule.values.join(', ') +
    ' → ' +
    (rule.serve ? 'on' : 'off')
  );
}

const REASONS: Record<string, string> = {
  'not-found': 'No such flag',
  disabled: 'The flag is switched off',
  everyone: 'Rolled out to everyone',
  'no-subject': 'Partial rollout but no user or tenant to bucket',
  provider: 'Decided by the external provider',
};

export function describeEvaluation(
  evaluation: FlagEvaluation,
  rules: FlagRule[] = [],
): string {
  if (evaluation.reason === 'rule') {
    const rule =
      evaluation.ruleIndex === undefined
        ? undefined
        : rules[evaluation.ruleIndex];

    return (
      'Rule ' +
      String((evaluation.ruleIndex ?? 0) + 1) +
      (rule ? ': ' + describeRule(rule) : '')
    );
  }

  if (evaluation.reason === 'rollout') {
    return (
      'Percentage rollout, bucket ' +
      String(evaluation.bucket ?? '?') +
      ' of 100'
    );
  }

  return REASONS[evaluation.reason] ?? evaluation.reason;
}
