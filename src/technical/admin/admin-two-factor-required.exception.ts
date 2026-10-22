import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#technical/errors/domain.exception';

/**
 * The message is the key itself, as it was before this had a catalogue
 * entry: the English text a person reads is the entry's `en` template.
 */
export class AdminTwoFactorRequiredException extends DomainException {
  constructor() {
    super(
      HttpStatus.FORBIDDEN,
      'admin.twoFactorRequired',
      'admin.twoFactorRequired',
    );
  }
}
