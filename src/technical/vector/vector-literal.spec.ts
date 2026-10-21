import { toVectorLiteral } from './vector-literal';

describe('toVectorLiteral', () => {
  it('renders the bracketed form pgvector parses', () => {
    expect(toVectorLiteral([0.5, -1, 2])).toBe('[0.5,-1,2]');
  });

  it('refuses an empty vector', () => {
    expect(() => toVectorLiteral([])).toThrow(/at least one dimension/);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])(
    'refuses %s, which pgvector would reject at the database',
    (value) => {
      expect(() => toVectorLiteral([1, value])).toThrow(/finite/);
    },
  );
});
