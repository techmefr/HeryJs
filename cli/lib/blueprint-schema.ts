import { z } from 'zod';
import { blueprintSchema } from './blueprint';

/**
 * Generated straight from the same zod schema `loadBlueprint` parses against,
 * so the two can never disagree -- there is no second, hand-maintained
 * description of what a blueprint may contain to keep in sync.
 */
export function blueprintJsonSchema(): object {
  return z.toJSONSchema(blueprintSchema);
}
