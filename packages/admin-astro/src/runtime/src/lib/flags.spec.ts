import { describe, expect, it } from 'vitest';
import {
  describeEvaluation,
  describeRule,
  flagPath,
  parseAttributes,
  parsePercentage,
  ruleProblem,
  splitValues,
} from './flags';

describe('flag form helpers', () => {
  it('splits values on commas and lines without blanks or repeats', () => {
    expect(splitValues(' pro, team\nfree ,, pro ')).toEqual([
      'pro',
      'team',
      'free',
    ]);
    expect(splitValues('')).toEqual([]);
  });

  it('reads name=value pairs and ignores malformed ones', () => {
    expect(parseAttributes('country=FR, seats = 10\nnonsense, =x')).toEqual({
      country: 'FR',
      seats: '10',
    });
  });

  it('accepts only whole percentages from 0 to 100', () => {
    expect(parsePercentage('0')).toBe(0);
    expect(parsePercentage('100')).toBe(100);
    expect(parsePercentage('101')).toBeNull();
    expect(parsePercentage('12.5')).toBeNull();
    expect(parsePercentage('')).toBeNull();
    expect(parsePercentage('abc')).toBeNull();
  });

  it('flags a rule the API would refuse', () => {
    const rule = {
      attribute: 'plan',
      operator: 'in' as const,
      values: ['pro'],
      serve: true,
    };

    expect(ruleProblem(rule)).toBeNull();
    expect(ruleProblem({ ...rule, attribute: '9 bad' })).not.toBeNull();
    expect(ruleProblem({ ...rule, values: [] })).not.toBeNull();
  });

  it('escapes the key in the route', () => {
    expect(flagPath('new checkout/v2')).toBe(
      '/feature-flags/new%20checkout%2Fv2',
    );
  });
});

describe('evaluation wording', () => {
  const rules = [
    {
      attribute: 'plan',
      operator: 'in' as const,
      values: ['pro'],
      serve: true,
    },
  ];

  it('names the rule that decided', () => {
    expect(describeRule(rules[0]!)).toBe('plan in pro → on');
    expect(
      describeEvaluation(
        { enabled: true, reason: 'rule', ruleIndex: 0 },
        rules,
      ),
    ).toBe('Rule 1: plan in pro → on');
  });

  it('reports the bucket of a percentage decision', () => {
    expect(
      describeEvaluation({ enabled: false, reason: 'rollout', bucket: 71 }),
    ).toBe('Percentage rollout, bucket 71 of 100');
  });

  it('explains the other reasons and passes an unknown one through', () => {
    expect(describeEvaluation({ enabled: false, reason: 'disabled' })).toBe(
      'The flag is switched off',
    );
    expect(describeEvaluation({ enabled: false, reason: 'odd' })).toBe('odd');
  });
});
