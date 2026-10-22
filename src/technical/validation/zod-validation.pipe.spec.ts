import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ValidationFailedException } from '#technical/errors/validation-failed.exception';
import { LocaleContextStorage } from '#technical/i18n/locale-context';
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

  it('rejects with a keyed domain exception', () => {
    const pipe = new ZodValidationPipe(schema);

    expect(() => pipe.transform({ data: [{ title: '' }] })).toThrow(
      ValidationFailedException,
    );
  });

  it('translates every issue in the request locale and keeps its path and code', () => {
    const pipe = new ZodValidationPipe(
      z.object({ title: z.string().min(3), count: z.number() }),
    );

    const error = LocaleContextStorage.run('fr', () => {
      try {
        pipe.transform({ title: 'a', count: 'x' });
      } catch (caught) {
        return caught as ValidationFailedException;
      }

      throw new Error('expected a rejection');
    });

    const report = error.getResponse();

    expect(error.key).toBe('validation.failed');
    expect(report.issues).toEqual([
      {
        path: ['title'],
        code: 'too_small',
        message: 'Trop petit : au moins 3 caractère(s) attendu(s).',
      },
      {
        path: ['count'],
        code: 'invalid_type',
        message: 'Type invalide : number attendu.',
      },
    ]);
    expect(report.fieldErrors.title).toEqual([
      'Trop petit : au moins 3 caractère(s) attendu(s).',
    ]);
  });

  it('keeps the message of a custom refinement as its author wrote it', () => {
    const pipe = new ZodValidationPipe(
      z.string().refine(() => false, { message: 'Pick another name.' }),
    );

    const error = LocaleContextStorage.run('fr', () => {
      try {
        pipe.transform('taken');
      } catch (caught) {
        return caught as ValidationFailedException;
      }

      throw new Error('expected a rejection');
    });

    expect(error.getResponse().issues[0]!.message).toBe('Pick another name.');
  });
});
