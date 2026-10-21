import { Injectable } from '@nestjs/common';
import { defaultKeyring } from './default-keyring';

@Injectable()
export class SecretsService {
  get activeKeyId(): string {
    return defaultKeyring().activeKeyId;
  }

  encrypt(plaintext: string, context: string): string {
    return defaultKeyring().seal(plaintext, context);
  }

  decrypt(envelope: string, context: string): string {
    return defaultKeyring().open(envelope, context);
  }

  isCurrent(envelope: string): boolean {
    return defaultKeyring().isCurrent(envelope);
  }

  reencrypt(envelope: string, context: string): string {
    return defaultKeyring().reseal(envelope, context);
  }
}
