export const VECTOR_METRICS = ['cosine', 'l2'] as const;

export type VectorMetric = (typeof VECTOR_METRICS)[number];

export const DEFAULT_VECTOR_METRIC: VectorMetric = 'cosine';

export type VectorTrash = 'exclude' | 'include' | 'only' | 'absent';

export interface VectorTarget {
  table: string;
  column: string;
  sourceColumn: string;
  dimensions: number;
  softDeletes: boolean;
}

const IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

export function assertIdentifier(value: string): string {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`"${value}" is not a valid SQL identifier.`);
  }

  return value;
}
