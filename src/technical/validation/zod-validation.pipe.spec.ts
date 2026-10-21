import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

const schema = z.object({
  data: z.array(z.object({ title: z.string().min(1) })),
});

describe('ZodValidationPipe', () => {
  it('returns the parsed value when it is valid', () => {
    const pipe = new ZodValidationPipe(schema);

    expect(pipe.transform({ data: [{ title: 'a' }] })).toEqual({
      data: [{ title: 'a' }],
    });
  });

  it('keeps the flattened report older clients read', () => {
    const pipe = new ZodValidationPipe(schema);

    try {
      pipe.transform({ data: [{ title: '' }] });
      throw new Error('expected a rejection');
    } catch (error) {
      const body = (error as BadRequestException).getResponse() as {
        formErrors: string[];
        fieldErrors: Record<string, string[]>;
      };
      expect(body.formErrors).toEqual([]);
      expect(body.fieldErrors.data).toHaveLength(1);
    }
  });

  it('also carries the full path of every issue so a form can pin it to a field', () => {
    const pipe = new ZodValidationPipe(schema);

    try {
      pipe.transform({ data: [{ title: 'ok' }, { title: '' }] });
      throw new Error('expected a rejection');
    } catch (error) {
      const body = (error as BadRequestException).getResponse() as {
        issues: { path: (string | number)[]; message: string }[];
      };
      expect(body.issues).toHaveLength(1);
      expect(body.issues[0]!.path).toEqual(['data', 1, 'title']);
    }
  });
});
