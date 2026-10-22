import { Injectable, PipeTransform } from '@nestjs/common';
import { z, ZodType } from 'zod';
import type { core } from 'zod';
import { ValidationFailedException } from '#technical/errors/validation-failed.exception';
import { translate } from '#technical/i18n/translate';

/**
 * Zod's own text is the English of every issue, and a refinement's message
 * (code `custom`) is written by whoever declared it, so it is kept as is.
 */
function messageOf(issue: core.$ZodIssue): string {
  return translate(`validation.issue.${issue.code}`, issue, issue.message);
}

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new ValidationFailedException({
        ...z.flattenError(result.error, messageOf),
        issues: result.error.issues.map((issue) => ({
          path: issue.path,
          code: issue.code,
          message: messageOf(issue),
        })),
      });
    }

    return result.data;
  }
}
