import { z } from 'zod';
import type { ExposedFieldSpec } from './exposition.types';

/**
 * Commander hands every CLI argument over as a string. `z.coerce` looks like
 * the natural fit but coerces the boolean case by JS truthiness -- 'false'
 * coerces to true, since it's a non-empty string -- so numbers and booleans
 * are converted by hand here instead, before the value ever reaches
 * schemaFor's validation.
 */
export function coerceCliValue(spec: ExposedFieldSpec, raw: string): unknown {
  switch (spec.kind) {
    case 'number': {
      const value = Number(raw);
      return Number.isNaN(value) ? raw : value;
    }
    case 'boolean':
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      return raw;
    case 'string':
    case 'enum':
      return raw;
  }
}

export function schemaFor(spec: ExposedFieldSpec): z.ZodType {
  switch (spec.kind) {
    case 'number': {
      const { min, max, step } = spec;
      let schema = z.number().min(min).max(max);

      if (step !== undefined) {
        schema = schema.refine(
          (value) => Number.isInteger((value - min) / step),
          { message: `must be a multiple of ${step} from ${min}` },
        );
      }

      return schema;
    }
    case 'boolean':
      return z.boolean();
    case 'string':
      return z.string().max(spec.maxLength);
    case 'enum':
      return z.enum(spec.values as [string, ...string[]]);
  }
}
