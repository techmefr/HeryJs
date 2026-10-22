import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export interface ValidationIssue {
  path: PropertyKey[];
  code: string;
  message: string;
}

export interface ValidationReport {
  formErrors: string[];
  fieldErrors: Record<string, string[]>;
  issues: ValidationIssue[];
}

/**
 * The report is also what `getResponse()` returns, as it did when this was a
 * plain BadRequestException carrying Zod's flattened errors: callers that
 * read the field errors from the exception itself keep finding them there.
 */
export class ValidationFailedException extends DomainException {
  constructor(private readonly report: ValidationReport) {
    super(
      HttpStatus.BAD_REQUEST,
      'validation.failed',
      'The request is invalid. Each issue is listed in details.issues.',
      report,
    );
  }

  override getResponse(): ValidationReport {
    return this.report;
  }
}
