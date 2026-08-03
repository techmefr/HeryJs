import { z } from 'zod';
import { blueprintSchema } from './blueprint';

/**
 * Generated straight from the same zod schema `loadBlueprint` parses against,
 * so the two can never disagree on what a blueprint may contain. `io: 'input'`
 * matters here: zod's default projection is the output side, where a key
 * carrying `.default()` is filled in by parsing and therefore "required" --
 * but the file an author writes is the input side, where that same key is
 * optional. Without it the schema marks fields required that the blueprint
 * format never demands.
 */
export function blueprintJsonSchema(): object {
  return z.toJSONSchema(blueprintSchema, { io: 'input' });
}
