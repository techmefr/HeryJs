export function toVectorLiteral(values: readonly number[]): string {
  if (values.length === 0) {
    throw new Error('A vector needs at least one dimension.');
  }

  for (const value of values) {
    if (!Number.isFinite(value)) {
      throw new Error('A vector can only hold finite numbers.');
    }
  }

  return `[${values.join(',')}]`;
}
