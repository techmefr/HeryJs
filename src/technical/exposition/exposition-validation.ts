import { z } from 'zod';
import type { ExposedFieldSpec } from './exposition.types';

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
