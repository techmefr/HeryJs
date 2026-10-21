import { HttpException, HttpStatus } from '@nestjs/common';
import { SCIM_ERROR_SCHEMA } from './scim.types';

export type ScimErrorType =
  | 'invalidFilter'
  | 'tooMany'
  | 'uniqueness'
  | 'mutability'
  | 'invalidSyntax'
  | 'invalidPath'
  | 'noTarget'
  | 'invalidValue'
  | 'invalidVers'
  | 'sensitive';

export interface ScimErrorBody {
  schemas: string[];
  status: string;
  scimType?: ScimErrorType;
  detail: string;
}

/**
 * The error shape RFC 7644 section 3.12 asks for. A directory reads `status`
 * and `scimType` to decide whether to retry, link to what exists or give up,
 * so a SCIM route never answers with the framework's own envelope.
 */
export class ScimException extends HttpException {
  constructor(
    status: HttpStatus,
    detail: string,
    readonly scimType?: ScimErrorType,
  ) {
    super(detail, status);
  }

  body(): ScimErrorBody {
    return {
      schemas: [SCIM_ERROR_SCHEMA],
      status: String(this.getStatus()),
      ...(this.scimType ? { scimType: this.scimType } : {}),
      detail: this.message,
    };
  }

  static badRequest(detail: string, type: ScimErrorType): ScimException {
    return new ScimException(HttpStatus.BAD_REQUEST, detail, type);
  }

  static notFound(kind: string): ScimException {
    return new ScimException(HttpStatus.NOT_FOUND, `No such ${kind}.`);
  }

  static conflict(detail: string): ScimException {
    return new ScimException(HttpStatus.CONFLICT, detail, 'uniqueness');
  }

  static unauthorized(): ScimException {
    return new ScimException(
      HttpStatus.UNAUTHORIZED,
      'A valid SCIM bearer token is required.',
    );
  }
}
